"""Name the looping clips of every person GLB with a "_loop" suffix (Godot's importer loops those) and write anims.json.

  python tools/assets/people_anims.py godot/assets/people
"""
import glob, json, os, struct, sys

DIR = sys.argv[1]
LOOP = {'idle_neutral_01', 'walk_neutral', 'sit_chair_idle_neutral_01', 'sit_table_idle_neutral_01', 'work_table', 'work_mid',
        'gestic_talk_neutral_01', 'drink_drinking', 'dancing_neutral'}
L = lambda c: c + '_loop' if c in LOOP else c
WORK = L('work_mid')   # standing, hands busy at waist height
# world anim / body state -> clip. Rocketbox has no bow: greetings use the wave.
ANIMS = {
    'idle': L('idle_neutral_01'), 'standing': L('idle_neutral_01'), 'stand_up': L('idle_neutral_01'), 'wait_queue': L('idle_neutral_01'),
    'walk': L('walk_neutral'), 'walking': L('walk_neutral'),
    'sit_idle': L('sit_chair_idle_neutral_01'), 'sit_down': L('sit_chair_idle_neutral_01'), 'sitting': L('sit_chair_idle_neutral_01'),
    'typing': L('sit_table_idle_neutral_01'),
    'use_machine': WORK, 'using': WORK, 'open_fridge': WORK, 'fill_cup': WORK, 'wash_hands': WORK, 'reach_switch': WORK,
    'pin_card': WORK, 'hang_coat': WORK, 'browse_shelf': WORK, 'write_board': WORK, 'throw': WORK, 'enter_cubicle': L('walk_neutral'),
    'work_standing': L('work_table'), 'talk': L('gestic_talk_neutral_01'), 'drink': L('drink_drinking'), 'smoke': L('drink_drinking'),
    'bow_15': 'wave_01', 'bow_30': 'wave_01', 'bow_45': 'wave_01', 'wave': 'wave_01',
    'clap': 'claphands_01', 'dance': L('dancing_neutral'),
}


def rename(path):
    b = open(path, 'rb').read()
    jl, = struct.unpack_from('<I', b, 12)
    g = json.loads(b[20:20 + jl])
    for a in g.get('animations', []):
        if not a['name'].endswith('_loop'):
            a['name'] = L(a['name'])
    js = json.dumps(g, separators=(',', ':')).encode(); js += b' ' * ((-len(js)) % 4)
    rest = b[20 + jl:]
    open(path, 'wb').write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + len(rest)) + struct.pack('<II', len(js), 0x4E4F534A) + js + rest)
    return [a['name'] for a in g['animations']]


names = None
for f in sorted(glob.glob(os.path.join(DIR, '*.glb'))):
    names = rename(f)
    print(os.path.basename(f), len(names))
missing = sorted({v for v in ANIMS.values()} - set(names or []))
assert not missing, f'anims.json points at clips the GLBs do not have: {missing}'
# Godot's importer loops "*_loop" clips and drops the suffix from the name, so anims.json uses the bare names
json.dump({k: v.removesuffix('_loop') for k, v in ANIMS.items()}, open(os.path.join(DIR, 'anims.json'), 'w'), indent=1)
print('clips', names)
