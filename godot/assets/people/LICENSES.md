# People: Microsoft Rocketbox avatars (MIT)

Source: https://github.com/microsoft/Microsoft-Rocketbox (MIT License, Copyright (c) 2020 Microsoft).
Converted with `tools/assets/rocketbox_to_glb.py` (Blender 4.5, headless): materials rebuilt from the avatar textures
(colour, normal, alpha-clipped hair), animations retargeted onto the avatar skeleton and baked at 15 fps,
walk made in-place; `tools/assets/people_anims.py` names looping clips and writes `anims.json`.
No bow clip exists in Rocketbox: greetings (`bow_15/30/45`) use `wave_01`.

| Person | Rocketbox avatar | Clips |
|---|---|---|
| manager | Male_Adult_03 | Assets/Animations/all_animations_max_motextr_static/m_*.max.fbx, walk: ..._xy/m_walk_neutral_01 |
| guard | Male_Adult_14 | same (m_) |
| yt_res | Male_Adult_08 | same (m_) |
| writer | Male_Adult_02 | same (m_) |
| longform | Male_Adult_13 | same (m_) |
| publisher | Male_Adult_07 | same (m_) |
| ig_res | Female_Adult_05 | same (f_) |
| facts | Female_Adult_15 | same (f_) |
| shorts | Female_Adult_02 | same (f_) |
| qa | Female_Adult_09 | same (f_) |
| cleaner | Female_Adult_14 | same (f_), body texture 1536 px to stay under 8 MB |

Clips in every GLB: idle_neutral_01, walk_neutral, sit_chair_idle_neutral_01, sit_table_idle_neutral_01, work_table,
work_mid, gestic_talk_neutral_01, drink_drinking, wave_01, claphands_01, dancing_neutral.
