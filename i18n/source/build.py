import json,sys,re
S=sys.argv[1]; out=sys.argv[2]
d={}
for f in ['en1.txt','en2.txt','en3.txt']:
    for line in open(S+'/'+f,encoding='utf8'):
        line=line.rstrip('\n')
        if not line.strip() or '\t' not in line: continue
        fr,en=line.split('\t',1)
        fr=re.sub(r'\s+',' ',fr.replace(' ',' ')).strip()
        if fr==en: continue
        d[fr]=en
js="/* Traductions anglaises du site (clé = texte français, {} = partie variable). Généré depuis le dossier de traduction. */\nwindow.PRIZM_EN = "+json.dumps(d,ensure_ascii=False,indent=0,sort_keys=True)+";\n"
open(out,'w',encoding='utf8').write(js); print(len(d))
