.PHONY: run test fetch train

run:
	.venv/bin/streamlit run app.py

test:
	MPLCONFIGDIR=/tmp/mirna-matplotlib .venv/bin/python -m pytest

fetch:
	.venv/bin/python scripts/fetch_data.py --with-genome --with-rfam

train:
	.venv/bin/python scripts/train_model.py
