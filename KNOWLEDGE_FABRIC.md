# JARVIS v0.8 — Knowledge Fabric

Knowledge Fabric gives JARVIS a persistent, provenance-aware corpus without pretending that retrieval is model-weight training.

## Design

```text
Kaggle / Hugging Face / World Bank / FRED / SEC / OpenAlex
                         |
                 live connector layer
                         |
             inspect / sample / validate
                         |
                 Approval Gateway
                         |
 Books / local files --> Chunker --> Knowledge Store
                         |             sourceRef
                         |             license
                         |             trust
                         |             fingerprint
                         v
                    RAG retrieval
                         |
                 Council / Agent prompt
```

The rules are:

1. **Live data stays live.** Economic/filing data is queried from its source when freshness matters.
2. **Persistent knowledge requires provenance.** Every indexed chunk carries a source, title, license label and trust score.
3. **No silent copyright ingestion.** Automatic book ingestion is limited to Project Gutenberg URLs or sources with an explicit open/public license. Local books are treated as user-provided/authorized material.
4. **No blind model-weight training.** v0.8 uses retrieval-augmented generation. This is reversible, source-aware and much less vulnerable to permanent poisoning than autonomous fine-tuning.
5. **External content is data, not instructions.** Prompt injection inside books/datasets must not become JARVIS policy.

## Connectors

### Kaggle

Configure `KAGGLE_API_TOKEN` in `.env.local`. JARVIS can search Kaggle directly:

```text
/kaggle xauusd gold forex
```

v0.8 deliberately searches/inspects datasets before persistence. Bulk archive downloading is not automatic because datasets can be huge and licenses vary.

### Hugging Face Datasets

```text
/hf finance trading
/hf-ingest owner/dataset [config] [split]
```

`/hf-ingest` persists at most 50 rows by default (hard maximum 100) through the Dataset Viewer API. Configure `HF_TOKEN` only when you already have access to a gated/private dataset.

### World Bank

No API key is required:

```text
/worldbank NY.GDP.MKTP.CD JOR 2015:2026
```

### FRED

Requires `FRED_API_KEY`:

```text
/fred DGS10 2024-01-01
```

### SEC EDGAR

No API key is required for the public data APIs. Set `SEC_USER_AGENT` to an identifying application/contact string and query by CIK:

```text
/sec 0000320193
```

### OpenAlex

Search open-access academic work:

```text
/papers market microstructure liquidity price discovery
```

An OpenAlex API key is optional for higher allowance.

## Trading books

List the curated starter library:

```text
/trading-library
```

Index one book after approval:

```text
/ingest-trading-book gutenberg-59518
```

Or index a book/file that you own or are authorized to use from the configured JARVIS workspace:

```text
/ingest-book books/my-trading-book.pdf
```

PDF ingestion uses local `pdftotext` (Poppler). TXT/Markdown/CSV/JSON work directly.

## Retrieval

```text
/knowledge liquidity sweep psychology
/knowledge stats
```

Normal non-sensitive questions also query the Knowledge Store automatically and inject the highest-scoring chunks into the system context with provenance metadata.

## What v0.8 does not do

- It does not permanently retrain LLM weights on downloaded Internet content.
- It does not treat Kaggle/Hugging Face popularity as factual reliability.
- It does not automatically ingest unknown-license datasets or copyrighted books.
- It does not use Health Vault data as training material.


## Kaggle file ingestion

Kaggle discovery uses the REST API. Persisting dataset rows is deliberately explicit: install the official Kaggle CLI (`py -m pip install -U kaggle` on Windows), configure `KAGGLE_API_TOKEN`, inspect a dataset, then run `/kaggle-ingest owner/dataset path/to/file.csv [license]`. Only CSV, TSV, JSON, JSONL, TXT, and Markdown files within `JARVIS_MAX_KNOWLEDGE_FILE_BYTES` are accepted. The temporary download is deleted after indexing.
