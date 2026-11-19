"""Extracts from an aligned dataset the consonant noises the karaoke uses (recorded consonants).

Usage: python3 extract.py aligned corpus ../../data/consonant-samples.json [report.json]

- Fricatives s ʃ f x and the friction of ch: the central, stable part of the noise (a texture the engine loops).
- Bursts of p t k: from the burst until voicing starts (played once).
For each voice (f = women arf_*, m = men arm_*) it keeps up to 2 examples per following vowel,
chosen by duration, voicelessness, typical spectrum of the consonant and signal-to-noise ratio.
Data: OpenSLR 61 (Guevara-Rukoz et al., 2020), CC BY-SA 4.0: the extracted fragments carry the same license."""
import json, glob, os, sys, base64, numpy as np, parselmouth, collections
from scipy.signal import resample_poly

ALI, COR, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
REP = sys.argv[4] if len(sys.argv) > 4 else None
FS_OUT = 32000
VOW = set('aeiou')
FRIC = {'s': 's', 'ʃ': 'sh', 'f': 'f', 'x': 'x', 'tʃ': 'ch'}
STOP = {'p': 'p', 't̪': 't', 'k': 'k'}

def hf_env(y, fs, lo=1500, win=0.003):
    """High-band energy (dB), 1 ms frames."""
    from scipy.signal import butter, sosfilt
    sos = butter(4, lo, 'high', fs=fs, output='sos'); h = sosfilt(sos, y)
    w = int(win * fs); hop = int(0.001 * fs)
    e = np.array([np.mean(h[i:i + w] ** 2) for i in range(0, max(1, len(h) - w), hop)])
    return 10 * np.log10(e + 1e-12), hop

cands = collections.defaultdict(list)
for jf in sorted(glob.glob(os.path.join(ALI, '*', '*.json'))):
    spk = os.path.basename(os.path.dirname(jf)); voice = 'f' if spk.startswith('arf') else 'm'
    wav = os.path.join(COR, spk, os.path.basename(jf)[:-5] + '.wav')
    snd = parselmouth.Sound(wav); y = snd.values[0].astype(np.float64); fs = int(snd.sampling_frequency)
    pitch = snd.to_pitch(time_step=0.002, pitch_floor=75, pitch_ceiling=500 if voice == 'f' else 300)
    voiced = lambda t: pitch.get_value_at_time(t) == pitch.get_value_at_time(t)
    noise_floor = np.percentile(np.abs(y), 5) + 1e-6
    ph = json.load(open(jf))['tiers']['phones']['entries']
    for i in range(len(ph) - 1):
        s, e, c = ph[i]; v = ph[i + 1][2]
        if v not in VOW: continue
        name = FRIC.get(c) or STOP.get(c)
        if not name: continue
        seg = y[int(s * fs):int(e * fs)]
        if name in ('s', 'sh', 'f', 'x', 'ch'):
            dur = e - s
            if dur < (0.06 if name != 'ch' else 0.05): continue
            env, hop = hf_env(seg, fs, lo=1000 if name == 'x' else 2000)
            if name == 'ch':                         # the friction starts when the high band rises after the closure
                on = int(np.argmax(np.diff(env, prepend=env[0])[:len(env) // 2])) if len(env) > 10 else 0
                a = s + on * hop / fs; b = e
            else:
                a, b = s + 0.25 * dur, e - 0.2 * dur
            if b - a < 0.035 or b - a > 0.12: continue
            ts = np.arange(a, b, 0.004)
            vfrac = np.mean([voiced(t) for t in ts])
            if vfrac > 0.25: continue
            x = y[int(a * fs):int(b * fs)]
            sp = np.abs(np.fft.rfft(x * np.hanning(len(x)), 4096)) ** 2; fr = np.fft.rfftfreq(4096, 1 / fs)
            cog = float((sp * fr).sum() / sp.sum())
            lv = float(np.sqrt(np.mean(x ** 2)))
            # stability: little variation of the high-band energy within the stretch
            ee, _ = hf_env(x, fs, lo=1000 if name == 'x' else 2000, win=0.005)
            stab = float(np.std(ee))
            cands[(voice, name)].append(dict(spk=spk, v=v, a=a, b=b, cog=cog, snr=20 * np.log10(lv / noise_floor), stab=stab, wav=wav, mode='loop'))
        else:
            if e - s < 0.035: continue
            a0 = int(max(0, s - 0.01) * fs); b0 = int((ph[i + 1][1]) * fs)
            env, hop = hf_env(y[a0:b0], fs, lo=1500, win=0.002)
            if len(env) < 20: continue
            d = np.diff(env); lim = int((e - s + 0.01) / 0.001) + 5
            ib = int(np.argmax(d[:min(len(d), lim)])) + 1
            jump = float(env[ib:ib + 3].max() - np.median(env[max(0, ib - 15):ib - 2])) if ib > 5 else 0
            tb = a0 / fs + ib * hop / fs
            tv = None
            for t in np.arange(tb + 0.002, tb + 0.08, 0.002):
                if voiced(t): tv = t; break
            if tv is None or jump < 12: continue
            vot = tv - tb
            # cut before the real vowel comes in: first frame where the low-band energy (< 800 Hz) rises 10 dB
            from scipy.signal import butter, sosfilt
            xs = y[int((tb - 0.002) * fs):int((tv + 0.004) * fs)]
            lo = sosfilt(butter(4, 800, 'low', fs=fs, output='sos'), xs); w2 = int(0.002 * fs)
            le = [10 * np.log10(np.mean(lo[i:i + w2] ** 2) + 1e-12) for i in range(0, len(lo) - w2, w2)]
            cut = len(xs) / fs
            if len(le) > 4:
                base = np.median(le[:3])
                for i in range(2, len(le)):
                    if le[i] > base + 10: cut = i * w2 / fs; break
            bend = (tb - 0.002) + max(0.006, cut - 0.001)
            cands[(voice, name)].append(dict(spk=spk, v=v, a=tb - 0.002, b=min(tv - 0.001, bend), vot=vot, jump=jump, wav=wav, mode='shot'))

# selection: noises by SNR, typical spectrum, stability and length; bursts by jump size and a typical VOT
TARGET_VOT = {'p': 0.010, 't': 0.014, 'k': 0.022}
sets = {'f': {}, 'm': {}}; report = {}
for (voice, name), L in sorted(cands.items()):
    if not L: continue
    if L[0]['mode'] == 'loop':
        med = np.median([c['cog'] for c in L])
        for c in L: c['score'] = c['snr'] - 25 * abs(c['cog'] / med - 1) - 1.5 * c['stab'] + 60 * (c['b'] - c['a'])
    else:
        for c in L: c['score'] = c['jump'] - 300 * abs(c['vot'] - TARGET_VOT[name])
    L.sort(key=lambda c: -c['score'])
    chosen = []; per_v = collections.Counter(); per_spk = collections.Counter()
    for c in L:
        if per_v[c['v']] >= 2 or per_spk[c['spk']] >= 4: continue
        chosen.append(c); per_v[c['v']] += 1; per_spk[c['spk']] += 1
        if len(chosen) >= 10: break
    toks = []
    for c in chosen:
        snd = parselmouth.Sound(c['wav']); fs = int(snd.sampling_frequency)
        x = snd.values[0][int(c['a'] * fs):int(c['b'] * fs)].astype(np.float64)
        x = resample_poly(x, FS_OUT, fs)
        from scipy.signal import butter, sosfiltfilt   # no low room rumble or leftovers of the voice
        hp = 250 if name == 'x' else 150 if c['mode'] == 'shot' else 400
        x = sosfiltfilt(butter(4, hp, 'high', fs=FS_OUT, output='sos'), x)
        n = len(x); f = int(0.004 * FS_OUT)
        if c['mode'] == 'loop':
            x /= np.sqrt(np.mean(x ** 2)) + 1e-9            # texture at RMS 1 (the engine applies the envelope)
            x[:f] *= np.linspace(0, 1, f); x[-f:] *= np.linspace(1, 0, f)
        else:
            x /= np.sqrt(np.mean(x[:int(0.008 * FS_OUT)] ** 2)) + 1e-9   # burst: RMS 1 over its first 8 ms
            x[:int(0.001 * FS_OUT)] *= np.linspace(0, 1, int(0.001 * FS_OUT)); fo = min(len(x) // 3, int(0.006 * FS_OUT)); x[-fo:] *= np.linspace(1, 0, fo)
        pk = np.abs(x).max(); scale = 32767 / pk
        pcm = np.round(x * scale).astype('<i2')
        toks.append({'v': c['v'], 'k': round(1 / scale, 8), 'd': base64.b64encode(pcm.tobytes()).decode()})
    sets[voice][name] = {'mode': L[0]['mode'], 'tok': toks}
    report[f'{voice}_{name}'] = dict(candidates=len(L), chosen=len(chosen), vowels=dict(per_v),
                                     ms=[round(1000 * (c['b'] - c['a'])) for c in chosen], speakers=dict(per_spk))
# compact JSON {fs, sets}: 16-bit PCM at 32 kHz in base64, k = scale factor (the license is in data/README.md)
js = json.dumps({'fs': FS_OUT, 'sets': sets}, ensure_ascii=False, separators=(',', ':'))
open(OUT, 'w', encoding='utf-8').write(js)
if REP: json.dump(report, open(REP, 'w'), ensure_ascii=False, indent=1)
for k, r in report.items(): print(k, r)
print('size', round(len(js) / 1024), 'KB')
