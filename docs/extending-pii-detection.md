# Personal-data detection: how it works and how to extend it

The guard server checks every customer message and every draft reply for personal data before anything reaches the customer. Two layers run inside the guard server, one after the other, and neither calls an LLM.

| Layer | Finds | How |
| --- | --- | --- |
| 1. Regional patterns | National IDs, tax numbers, cards, IBANs, emails, phones, one-time codes | Regular expressions per region, with nearby words and checksums |
| 2. NeMo's PII extension | People's names, places, crypto wallets | NeMo Guardrails' sensitive-data rail, which runs Presidio with the spaCy `en_core_web_lg` language model |

The Colang flows in `guardrails/catalog/flows/checks.co` run layer 1, then layer 2, then the written rules. The first check that blocks stops the request, and the app labels which check decided: "Pattern check, no model" or "NeMo PII extension (Presidio), no LLM".

## Layer 1: regional patterns

The check is a NeMo custom action, `screen_pii`. Each region has a profile in `guardrails/catalog/regions/` (`SG`, `IN`, `AU`, `US`, `EU`), plus `global.yml`, which is always on. Every entry is a regular expression with a score, optional context words, and an optional checksum:

```yaml
- id: SG_NRIC
  label: NRIC or FIN
  pattern: '\b[STFGM]\d{7}[A-Z]\b'
  score: 0.7
  context: [nric, fin, identity]
  validator: sg_nric
```

The presenter picks one of three strictness versions in the app:

| Version | A match counts when |
| --- | --- |
| 1 | The text has the right shape |
| 2 | The shape matches and a context word is within 40 characters |
| 3 | As version 2, and the checksum passes |

Checksums live in `src/guardrails/pii_validators.py`: card numbers (Luhn), Singapore NRIC and FIN, Australian tax file numbers, IBANs, and Aadhaar. Every hit records why it counted or not, which the **Try a sentence** tester and the audit trail show.

## Layer 2: NeMo's PII extension

The guard server switches on NeMo Guardrails' built-in sensitive-data detection. NeMo runs [Presidio](https://microsoft.github.io/presidio/), and Presidio uses spaCy's language model to recognise names and places from the surrounding words, plus its own validated recognizers, such as the crypto wallet recognizer, which checks the address's built-in checksum.

What it looks for is set in `guardrails/catalog/sensitive_data.yml`:

```yaml
input:
  score_threshold: 0.4
  entities: [PERSON, LOCATION, CRYPTO]
output:
  score_threshold: 0.4
  entities: [PERSON, CRYPTO]
```

- `LOCATION` is checked on input only, because ordinary answers often name a city or country.
- `DATE_TIME` is left out on purpose: it also matches "today" and "this month" in ordinary questions, which would block normal requests.
- Entity names are listed in [Presidio's supported entities](https://microsoft.github.io/presidio/supported_entities/). Edit the file, then press **Deploy** in Custom policies or restart the guard server to reload.

Requirements and costs:

- NeMo Guardrails 0.24.1 requires exactly the spaCy model `en_core_web_lg` (about 560 MB download); `scripts/install_dependencies.py` installs it.
- The guard server loads the model on the first check after it starts, which takes about 5 seconds. Later checks take tens of milliseconds. With the model loaded, the guard server uses under 1 GiB of memory.
- NeMo's extension reports only whether it found something, not what. The app therefore says "personal details, such as a name, place, or crypto wallet" rather than naming the value.

## What is caught

| Customer writes | Caught by |
| --- | --- |
| "My NRIC is S1234567D" | Regional patterns |
| "Card 4111 1111 1111 1111 and the OTP is 839201" | Regional patterns |
| "Hi, I'm Priya Raman. Please send my new card to 12 Orchard Road, Singapore." | NeMo's PII extension (name and place) |
| A draft revealing "Alice Johnson, born 14 February 1978, lives at 42 Elm Street, Boston" | NeMo's PII extension at the output check (name) |
| "Please send my refund to bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq" | NeMo's PII extension (validated wallet) |
| The same wallet address with one character changed | Not flagged: the checksum fails |

The three NeMo examples are tests in the **Customer data** risk area.

## Known limits

- **Dates of birth** are not checked on their own (see `DATE_TIME` above). Write a custom policy if you need them.
- **Street addresses** are recognised through the city or country they mention, not the street line itself.
- **spaCy misses some names**, especially lower-case names and names that are uncommon in its English training text, including many Asian names. It can also read words such as "Orchard" or "OTP" as a place or a person.
- **Context words in layer 1 are plain text.** Synonyms a profile does not list (for example "IC" instead of "NRIC") are not recognised.
- **Short numeric patterns can over-block** at version 1. The phone pattern, for example, matches many 7 to 8 digit numbers; version 2 or 3 reduces this.

## Extending detection

Pick the smallest option that covers the gap.

### 1. Add or tune a regional pattern

Add an entry to the region's YAML file. To add a checksum, write a function in `src/guardrails/pii_validators.py` that returns `True` for a valid value, add it to `VALIDATORS`, and reference it with `validator:`. Run the **Try a sentence** tester in the app to check the result. Use this for any identifier with a fixed format, such as a new national ID or a bank account format.

### 2. Detect more entity types with NeMo's PII extension

Add entity names to `guardrails/catalog/sensitive_data.yml`. Presidio already ships validated recognizers for IP addresses, IBANs, US passports and driving licences, UK NHS numbers, and many country-specific IDs. Test new entities against the everyday tests in the app before deploying, because language-model entities can block ordinary requests.

You can also add your own Presidio pattern recognizers under a `recognizers:` key in the same file; see [Presidio's no-code recognizers](https://microsoft.github.io/presidio/tutorial/08_no_code/).

### 3. Add a written rule for context-dependent cases

In **Custom policies**, write a rule in plain English, for example: "Block a message that reveals a person's date of birth together with their account number." The configured judge decides each message. It handles context well, but each check is a model call of about 1 to 3 seconds and the verdict can vary between runs.

### 4. Add GLiNER2 for broader coverage

GLiNER models are trained specifically to find personal data and accept any label you ask for, such as `street_address` or `date_of_birth`. NeMo Guardrails has a GLiNER rail (`gliner detect pii on input` and `gliner detect pii on output`) configured under `rails.config.gliner`.

| Where to run it | Notes |
| --- | --- |
| NVIDIA-hosted [`fastino/gliner2-pii`](https://build.nvidia.com/fastino/gliner2-pii/modelcard) | Quickest to try, with an NVIDIA API key. Customer text leaves your environment. The older hosted `nvidia/gliner-pii` endpoint is deprecated. |
| Third Cloudera AI Application | Runs the open model from Hugging Face on CPU (4 vCPU, 8 GiB) behind NVIDIA's reference GLiNER server (`examples/deployment/gliner_server` in the NeMo Guardrails repository). Nothing leaves the workbench. Install the CPU-only PyTorch build and download the model (about 1.5 GB) during setup. The guard server calls it server to server, so it needs unauthenticated access. |
| Cloudera AI Inference Service | Not supported: the service rejects models whose Hugging Face library is `gliner`. |

Check that the rail in your NeMo Guardrails version understands the chosen model's response format before relying on it.
