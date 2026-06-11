# Pouzdan 15-min okidač preko cron-job.org (besplatno)

GitHub-ov ugrađeni `schedule` cron baca većinu termina na low-traffic repo-ima
(viđeno ~1 run na 2h umesto na 15 min). Zato koristimo besplatan spoljni cron
servis koji svakih 15 min pozove GitHub API i sam okine proveru.

Okidač u workflow-u: `repository_dispatch` sa `event_type: run-check`
(API endpoint: `POST https://api.github.com/repos/brankoPauk/fh-healthcheck/dispatches`).

---

## Korak 1 — Napravi GitHub token (jednom)

1. Otvori: https://github.com/settings/personal-access-tokens/new
   (Settings → Developer settings → **Fine-grained personal access tokens** → Generate new token)
2. **Token name:** `fhub-cron-trigger`
3. **Expiration:** 1 godina (ili "No expiration" ako želiš da ne ističe)
4. **Repository access:** "Only select repositories" → izaberi **`fh-healthcheck`**
5. **Permissions → Repository permissions → Contents:** postavi na **Read and write**
   (ovo je jedino pravo koje treba za `repository_dispatch`)
6. **Generate token** → KOPIRAJ token (počinje sa `github_pat_...`).
   Vidi se samo jednom — sačuvaj ga negde na trenutak.

---

## Korak 2 — Napravi cron job na cron-job.org (jednom)

1. Otvori https://cron-job.org → registruj se besplatno (email + lozinka).
2. **Create cronjob** (dugme gore desno).
3. **Title:** `FormationHub health check`
4. **URL:** `https://api.github.com/repos/brankoPauk/fh-healthcheck/dispatches`
5. **Schedule:** Every 15 minutes
   (izaberi "Every 15 minutes" ili u "Custom" → minutes: 0,15,30,45)
6. Otvori **Advanced** (ili "Advanced settings"):
   - **Request method:** `POST`
   - **Headers** (dodaj svaki kao Key / Value):
     | Key | Value |
     |-----|-------|
     | `Authorization` | `Bearer github_pat_OVDE_TVOJ_TOKEN` |
     | `Accept` | `application/vnd.github+json` |
     | `X-GitHub-Api-Version` | `2022-11-28` |
     | `Content-Type` | `application/json` |
   - **Request body** (uključi "Custom request body" ako treba):
     ```json
     {"event_type":"run-check"}
     ```
7. **Save / Create**.

cron-job.org će odmah uraditi prvi test poziv — ako je sve dobro, javlja status
**204 No Content** (to je uspeh za ovaj GitHub endpoint). U GitHub **Actions** tabu
za par sekundi vidiš nov run sa trigerom **`repository_dispatch`**.

---

## Provera

GitHub repo → **Actions** → run-ovi sa kolonom **`repository_dispatch`** treba da
se pojavljuju ~svakih 15 min. To je sad pravi izvor cadence-a; `schedule` run-ovi
mogu i dalje da iskoče povremeno — to je samo rezerva.

## Ako nešto ne radi
- cron-job.org pokazuje grešku `401` → token pogrešno nalepljen ili nema `Bearer ` ispred.
- `403` → token nema `Contents: Read and write` na pravom repo-u.
- `404` → pogrešan URL (proveri `brankoPauk/fh-healthcheck`).
- `422` → telo (body) nije `{"event_type":"run-check"}`.
- Status `204` = SVE OK (nije greška, to je očekivani odgovor).
