"""Builds the corpus for the aligner from OpenSLR 61 (Argentinian Spanish).
Usage: python3 prepare.py "<dataset folder>" <output corpus> [speakers...]
Leaves <corpus>/<speaker>/<utterance>.wav + .lab and words.json (for g2p.mjs)."""
import os, sys, glob, re, json, shutil
src, out = sys.argv[1], sys.argv[2]; only = set(sys.argv[3:])
os.makedirs(out, exist_ok=True); words = set(); n = 0
for wav in glob.glob(os.path.join(src, 'Dataset clean', '*', '*.wav')):
    b = os.path.basename(wav)[:-4]; spk = '_'.join(b.split('_')[:2])
    if only and spk not in only: continue
    g = 'female' if b.startswith('arf') else 'male'
    tr = os.path.join(src, f'transcripts_{g}', f'transcript_{b}.txt')
    if not os.path.exists(tr): continue
    t = open(tr, encoding='utf-8').read().strip().lower()
    t = re.sub(r'\s+', ' ', re.sub(r'[^a-záéíóúüñ\s]', ' ', t)).strip()
    os.makedirs(os.path.join(out, spk), exist_ok=True)
    shutil.copy(wav, os.path.join(out, spk, b + '.wav')); open(os.path.join(out, spk, b + '.lab'), 'w').write(t)
    words |= set(t.split()); n += 1
json.dump(sorted(words), open(os.path.join(out, 'words.json'), 'w'))
print(n, 'utterances,', len(words), 'words')
