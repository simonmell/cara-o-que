"""Measures every consonant-vowel pair of the aligned corpus with Praat (parselmouth): duration, F2 at vowel onset and
mid-vowel (locus equations), consonant-vs-vowel intensity, noise spectrum (centre of gravity and peak) and voicing.
Usage: python3 measure.py [aligned] [corpus] [measurements.json]"""
import json, glob, os, numpy as np, parselmouth, collections
import sys
ALI, COR, OUT = (sys.argv[1:4] + ['aligned', 'corpus', 'measurements.json'][len(sys.argv[1:4]):])
from parselmouth.praat import call
VOW = {'a','e','i','o','u'}
# place of articulation of each MFA phone
PLACE = {'p':'lab','b':'lab','β':'lab','m':'lab','f':'lab','t̪':'den','d̪':'den','ð':'den','n':'alv','s':'alv','l':'alv','ɾ':'alv','r':'alv',
         'k':'vel','ɡ':'vel','ɣ':'vel','x':'vel','ʃ':'pal','ʝ':'pal','tʃ':'pal','ɲ':'pal'}
rows = []
for jf in sorted(glob.glob(os.path.join(ALI, '*', '*.json'))):
    spk = os.path.basename(os.path.dirname(jf)); fem = spk.startswith('arf')
    wav = os.path.join(COR, spk, os.path.basename(jf)[:-5] + '.wav')
    snd = parselmouth.Sound(wav)
    fmt = snd.to_formant_burg(time_step=0.005, max_number_of_formants=5, maximum_formant=5500 if fem else 5000, window_length=0.025)
    inten = snd.to_intensity(minimum_pitch=100, time_step=0.005)
    pitch = snd.to_pitch(time_step=0.005, pitch_floor=75, pitch_ceiling=500 if fem else 300)
    ph = json.load(open(jf))['tiers']['phones']['entries']
    for i in range(1, len(ph) - 1):
        s, e, c = ph[i]; ns, ne, v = ph[i + 1]
        if c not in PLACE or v not in VOW: continue
        ps, pe, pv = ph[i - 1]
        dur = e - s; vd = ne - ns
        if vd < 0.05: continue
        def F2(t):
            x = fmt.get_value_at_time(2, t); return x if x == x else None
        f2on = F2(ns + 0.012); f2mid = F2(ns + vd / 2); f1mid = fmt.get_value_at_time(1, ns + vd / 2)
        # consonant intensity (mean of the central stretch) vs the vowel
        ic = call(inten, 'Get mean', s + dur * 0.25, e - dur * 0.25, 'dB'); iv = call(inten, 'Get mean', ns + vd * 0.25, ne - vd * 0.25, 'dB')
        # consonant spectrum (central stretch): centre of gravity and peak
        seg = snd.extract_part(s + dur * 0.2, e - dur * 0.2, parselmouth.WindowShape.HAMMING, 1, False)
        sp = seg.to_spectrum(); cog = call(sp, 'Get centre of gravity', 2)
        arr = np.array(sp.values[0] ** 2 + sp.values[1] ** 2); fr = np.linspace(0, sp.xmax, len(arr)); m = fr > 500
        peak = float(fr[m][np.argmax(arr[m])])
        # voicing: fraction of frames with f0 inside the consonant
        ts = np.arange(s + 0.005, e - 0.002, 0.005); vfr = np.mean([pitch.get_value_at_time(t) == pitch.get_value_at_time(t) for t in ts]) if len(ts) else np.nan
        rows.append(dict(spk=spk, fem=fem, c=c, v=v, prev=pv, dur=dur, f2on=f2on, f2mid=f2mid, f1mid=f1mid, dI=ic - iv if ic == ic and iv == iv else None,
                         cog=cog, peak=peak, voiced=vfr, place=PLACE[c], tstart=s, tend=e, vend=ne, wav=wav))
json.dump(rows, open(OUT, 'w'))
print(len(rows), 'consonant-vowel pairs')
