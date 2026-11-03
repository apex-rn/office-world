#include "CCBridge.h"

#include "Dom/JsonObject.h"
#include "Engine/World.h"
#include "GameFramework/Pawn.h"
#include "IWebSocket.h"
#include "Modules/ModuleManager.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "WebSocketsModule.h"

// Server metres (x east, y up, z south; yaw: forward = (sin, cos) in x-z) -> Unreal cm (X east, Y south, Z up).
static FVector ToUE(double X, double Y, double Z) { return FVector(X * 100.0, Z * 100.0, Y * 100.0); }
static float YawToUE(double Yaw) { return 90.f - FMath::RadiansToDegrees(static_cast<float>(Yaw)); }

ACCBridge::ACCBridge()
{
	PrimaryActorTick.bCanEverTick = true;
}

void ACCBridge::BeginPlay()
{
	Super::BeginPlay();
	FModuleManager::LoadModuleChecked<FWebSocketsModule>(TEXT("WebSockets"));
	Connect();
}

void ACCBridge::EndPlay(const EEndPlayReason::Type Reason)
{
	if (Socket.IsValid()) { Socket->Close(); Socket.Reset(); }
	Super::EndPlay(Reason);
}

void ACCBridge::Connect()
{
	Socket = FWebSocketsModule::Get().CreateWebSocket(ServerUrl, TEXT(""));
	TWeakObjectPtr<ACCBridge> Self(this);
	Socket->OnMessage().AddLambda([Self](const FString& Msg) { if (Self.IsValid()) Self->HandleMessage(Msg); });
	Socket->OnConnectionError().AddLambda([Self](const FString& Err)
	{
		UE_LOG(LogTemp, Warning, TEXT("CCBridge: connection error: %s (retrying)"), *Err);
		if (Self.IsValid()) Self->ReconnectIn = 3.f;
	});
	Socket->OnClosed().AddLambda([Self](int32, const FString&, bool) { if (Self.IsValid()) Self->ReconnectIn = 3.f; });
	Socket->Connect();
}

void ACCBridge::SendBossCommand(const FString& CommandJson)
{
	if (Socket.IsValid() && Socket->IsConnected()) Socket->Send(FString::Printf(TEXT("{\"t\":\"boss\",\"cmd\":%s}"), *CommandJson));
}

bool ACCBridge::GetBody(const FString& Id, FCCBodyState& Out) const
{
	if (const FCCBodyState* B = Bodies.Find(Id)) { Out = *B; return true; }
	return false;
}

void ACCBridge::HandleMessage(const FString& Message)
{
	TSharedPtr<FJsonObject> Obj;
	if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Message), Obj) || !Obj.IsValid()) return;
	const FString Type = Obj->GetStringField(TEXT("t"));

	if (Type == TEXT("snap"))
	{
		Obj->TryGetStringField(TEXT("activity"), Activity);
		const TArray<TSharedPtr<FJsonValue>>* Arr = nullptr;
		if (Obj->TryGetArrayField(TEXT("bodies"), Arr))
		{
			for (const TSharedPtr<FJsonValue>& V : *Arr)
			{
				const TSharedPtr<FJsonObject> J = V->AsObject();
				FCCBodyState B;
				B.Id = J->GetStringField(TEXT("id"));
				B.Location = ToUE(J->GetNumberField(TEXT("x")), J->GetNumberField(TEXT("y")), J->GetNumberField(TEXT("z")));
				B.Yaw = YawToUE(J->GetNumberField(TEXT("yaw")));
				B.State = FName(*J->GetStringField(TEXT("state")));
				B.Anim = FName(*J->GetStringField(TEXT("anim")));
				FString Holding; B.bHolding = J->TryGetStringField(TEXT("holding"), Holding) && !Holding.IsEmpty();
				J->TryGetStringField(TEXT("seat"), B.Seat);
				Bodies.Add(B.Id, B);
			}
		}
		const TSharedPtr<FJsonObject>* DoorObj = nullptr;
		if (Obj->TryGetObjectField(TEXT("doors"), DoorObj))
		{
			for (const auto& Pair : (*DoorObj)->Values)
			{
				const bool bOpen = Pair.Value->AsNumber() > 0.5;
				if (!Doors.Contains(Pair.Key) || Doors[Pair.Key] != bOpen) { Doors.Add(Pair.Key, bOpen); OnDoor.Broadcast(Pair.Key, bOpen); }
			}
		}
	}
	else if (Type == TEXT("event"))
	{
		const TSharedPtr<FJsonObject> E = Obj->GetObjectField(TEXT("e"));
		FString EType; E->TryGetStringField(TEXT("type"), EType);
		if (EType == TEXT("speech"))
		{
			FString To; E->TryGetStringField(TEXT("to"), To);
			OnSpeech.Broadcast(E->GetStringField(TEXT("from")), To, E->GetStringField(TEXT("text")));
		}
	}
}

APawn* ACCBridge::EnsurePawn(const FCCBodyState& B)
{
	if (TObjectPtr<APawn>* Found = Pawns.Find(B.Id)) return Found->Get();
	const TSubclassOf<APawn>* Cls = CharacterClasses.Find(B.Id);
	UClass* C = Cls && *Cls ? Cls->Get() : DefaultCharacterClass.Get();
	if (!C) return nullptr;
	FActorSpawnParameters P;
	P.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	APawn* Pawn = GetWorld()->SpawnActor<APawn>(C, B.Location + FVector(0, 0, FeetToOrigin), FRotator(0, B.Yaw, 0), P);
	if (Pawn) { Pawn->SetActorLabel(B.Id); Pawns.Add(B.Id, Pawn); }
	return Pawn;
}

void ACCBridge::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (ReconnectIn >= 0.f && (ReconnectIn -= DeltaSeconds) < 0.f) { ReconnectIn = -1.f; Connect(); }
	for (const auto& Pair : Bodies)
	{
		const FCCBodyState& B = Pair.Value;
		APawn* Pawn = B.State == TEXT("offsite") ? nullptr : EnsurePawn(B);
		if (TObjectPtr<APawn>* Existing = Pawns.Find(B.Id)) (*Existing)->SetActorHiddenInGame(B.State == TEXT("offsite"));
		if (!Pawn) continue;
		const FVector Want = B.Location + FVector(0, 0, FeetToOrigin);
		const FVector Now = FMath::VInterpTo(Pawn->GetActorLocation(), Want, DeltaSeconds, PositionSmoothing);
		const FRotator Rot = FMath::RInterpTo(Pawn->GetActorRotation(), FRotator(0, B.Yaw, 0), DeltaSeconds, PositionSmoothing);
		Pawn->SetActorLocationAndRotation(Now, Rot);
	}
}
