"""Пути скриптов аудита клипов. Всё считается от расположения этого файла, переопределяется переменными окружения.

AUDIT_FBX_DIR   каталог FBX            (по умолчанию <repo>/assets/rig-source/terraks)
AUDIT_OUT       каталог результатов    (по умолчанию scripts/clips-audit/out; в .gitignore)
AUDIT_POSE_DIR  откуда lib.py/validate.py читают FK-позы (по умолчанию scripts/clips-audit/pose, эталон в git;
                свежие позы после fk.py лежат в out/pose)
AUDIT_GLB       нетронутый GLB для validate.py/hyp.py/restpose.py через gltf_pose.json (см. README)
"""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
FBX_DIR = os.environ.get('AUDIT_FBX_DIR', os.path.join(REPO, 'assets', 'rig-source', 'terraks'))
OUT = os.environ.get('AUDIT_OUT', os.path.join(HERE, 'out'))
POSE_DIR = os.environ.get('AUDIT_POSE_DIR', os.path.join(HERE, 'pose'))
DUMP_DIR = os.path.join(OUT, 'dump')       # dump.py -> fk.py
POSE_OUT = os.path.join(OUT, 'pose')       # fk.py пишет сюда
GLTF_POSE = os.path.join(OUT, 'gltf_pose.json')  # gltf_fk.mjs пишет сюда, validate/hyp/restpose читают
def out(*p):
    d = os.path.join(OUT, *p[:-1]); os.makedirs(d, exist_ok=True); return os.path.join(OUT, *p)
