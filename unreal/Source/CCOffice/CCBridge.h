// Compound Chronicle — live bridge from the office server to Unreal (docs/UNREAL_PLAN.md, U2).
// Connects to packages/server/src/stream.ts over WebSocket, spawns one pawn (MetaHuman Blueprint) per person and
// moves it to the server's authoritative position/rotation with smoothing. Animation Blueprints read the person's
// State/Anim through GetBody(). The server is the only source of truth: Unreal never decides where people go.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "CCBridge.generated.h"

class IWebSocket;

USTRUCT(BlueprintType)
struct FCCBodyState
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, Category = "CC") FString Id;
	/** feet position in Unreal units (cm). Sitting people report the seat height in Z. */
	UPROPERTY(BlueprintReadOnly, Category = "CC") FVector Location = FVector::ZeroVector;
	UPROPERTY(BlueprintReadOnly, Category = "CC") float Yaw = 0.f;
	/** offsite | standing | walking | sitting | using */
	UPROPERTY(BlueprintReadOnly, Category = "CC") FName State;
	/** idle, walk, sit_idle, typing, use_machine, bow_15, bow_30, bow_45, bow_handshake, clap, dance, ... */
	UPROPERTY(BlueprintReadOnly, Category = "CC") FName Anim;
	UPROPERTY(BlueprintReadOnly, Category = "CC") bool bHolding = false;
	UPROPERTY(BlueprintReadOnly, Category = "CC") FString Seat;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FCCSpeech, const FString&, From, const FString&, To, const FString&, Text);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FCCDoor, const FString&, DoorId, bool, bOpen);

UCLASS()
class CCOFFICE_API ACCBridge : public AActor
{
	GENERATED_BODY()

public:
	ACCBridge();

	UPROPERTY(EditAnywhere, Category = "CC") FString ServerUrl = TEXT("ws://127.0.0.1:8765");
	/** person id (manager, guard, writer, ...) -> MetaHuman Blueprint; others use DefaultCharacterClass */
	UPROPERTY(EditAnywhere, Category = "CC") TMap<FString, TSubclassOf<APawn>> CharacterClasses;
	UPROPERTY(EditAnywhere, Category = "CC") TSubclassOf<APawn> DefaultCharacterClass;
	/** distance from the pawn's origin to its feet (Character capsule half height) */
	UPROPERTY(EditAnywhere, Category = "CC") float FeetToOrigin = 90.f;
	UPROPERTY(EditAnywhere, Category = "CC") float PositionSmoothing = 12.f;

	UPROPERTY(BlueprintAssignable, Category = "CC") FCCSpeech OnSpeech;
	UPROPERTY(BlueprintAssignable, Category = "CC") FCCDoor OnDoor;

	UFUNCTION(BlueprintPure, Category = "CC") bool GetBody(const FString& Id, FCCBodyState& Out) const;
	UFUNCTION(BlueprintPure, Category = "CC") FString GetActivity() const { return Activity; }
	/** The Boss's own body (requires ?token= in ServerUrl). Json: {"verb":"go_to","target":"kitchen"} */
	UFUNCTION(BlueprintCallable, Category = "CC") void SendBossCommand(const FString& CommandJson);

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;
	virtual void Tick(float DeltaSeconds) override;

private:
	void Connect();
	void HandleMessage(const FString& Message);
	APawn* EnsurePawn(const FCCBodyState& B);

	TSharedPtr<IWebSocket> Socket;
	UPROPERTY() TMap<FString, TObjectPtr<APawn>> Pawns;
	TMap<FString, FCCBodyState> Bodies;
	TMap<FString, bool> Doors;
	FString Activity;
	float ReconnectIn = -1.f;
};
