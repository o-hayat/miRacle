"""Small independently generated Python oracles for browser edge cases."""
from pathlib import Path
import json
import sys
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from mirna_app.sequence import parse_sequence_text, infer_input_type, valid_segments, reverse_complement_rna, reverse_hit_to_forward
from mirna_app.features import extract_features, passes_candidate_gate
from mirna_app.folding import fold_one
from mirna_app.types import FoldHit
from mirna_app.similarity import ReferenceMatcher, local_alignment_identity


def main():
    texts = ["", "A" * 54, "A" * 55, "N" * 60, "ACGU" * 5000, "A" * 20001,
             ">first\n" + "A" * 60 + "\n>second\n" + "C" * 60,
             ">header\n", "ACGTR" * 15, "acgtun \n" * 10,
             ">header mentions U RNA\n" + "ACGT" * 20, "ACGU" * 20, "ACGU" * 19 + "T"]
    parsing=[]
    for text in texts:
        try:
            parsed=parse_sequence_text(text)
            expected=dict(identifier=parsed.identifier, description=parsed.description, sequence=parsed.sequence)
            parsing.append(dict(text=text, expected=expected, input_type=infer_input_type(text)))
        except ValueError as error:
            parsing.append(dict(text=text, error=str(error)))
    sequences=["A"*55+"N"+"G"*54+"NN"+"C"*60,"N"*60,"ACGU"*20]
    segments=[dict(sequence=s,expected=valid_segments(s),reverse=reverse_complement_rna(s)) for s in sequences]
    folds=[]
    for seq in ["A"*60,"G"*25+"A"*10+"C"*25,"ACGU"*15]:
        structure,mfe=fold_one(seq)
        f=extract_features(FoldHit(1,len(seq),"+",seq,structure,mfe))
        folds.append(dict(sequence=seq,structure=structure,mfe=mfe,features=f,passes=passes_candidate_gate(f)))
    matches=[]
    for n in [1,5,7,20,40]:
        records=[(f"tie-{i}","AUGCAUGCAUGC") for i in range(n)]
        matcher=ReferenceMatcher(records)
        matrix=matcher.matrix
        asset=dict(records=records,species=matcher.species,source=matcher.source,
                   vocabulary={k:int(v) for k,v in matcher.vectorizer.vocabulary_.items()},
                   idf=matcher.vectorizer.idf_.tolist(),indptr=matrix.indptr.tolist(),indices=matrix.indices.tolist(),data=matrix.data.tolist())
        from dataclasses import asdict
        matches.append(dict(asset=asset,query="AUGCAUGCAUGC",expected=asdict(matcher.match("AUGCAUGCAUGC"))))
    rng=np.random.default_rng(42)
    sorts=[]
    for size in [0,1,5,16,17,20,50,100,3279]:
        values=rng.integers(0,6,size).astype(float)
        sorts.append(dict(values=values.tolist(),expected=np.argsort(values).tolist()))
    payload=dict(parsing=parsing,segments=segments,folds=folds,matches=matches,sorts=sorts,
        alignments=[dict(query=q,reference=r,expected=local_alignment_identity(q,r)) for q,r in [("CCAUGCAUGCGG","AUGCAUGC"),("AAAA","CCCC"),("ACGUACGUA","ACGACGUA")]],
        coordinates=[dict(start=a,end=b,length=n,expected=reverse_hit_to_forward(a,b,n)) for a,b,n in [(1,60,100),(41,100,100),(1,20000,20000)]])
    (ROOT/"web/tests/fixtures/edges.json").write_text(json.dumps(payload,separators=(",",":")))


if __name__ == "__main__":
    main()
