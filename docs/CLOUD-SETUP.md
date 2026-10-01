# Einrichtung: GitHub, Claude Code in der Cloud, Fly.io

Historical Claude-cloud onboarding guide. Current implementation and acceptance status: [`STATUS.md`](STATUS.md); current work: [`ROADMAP.md`](ROADMAP.md). Real financial data, exports/mappings and production secrets stay outside cloud sessions. Use `docs/ops.md` for deployment and real backup/restore verification.

## 1. GitHub-Repo anlegen und hochladen

1. Auf github.com ein neues **privates** Repo `budget` anlegen, **leer** (kein README, keine .gitignore).
2. Lokal im Ordner `C:\Users\fabia\budget`:

```powershell
git remote add origin https://github.com/Grabman1987/budget.git
git push -u origin main
```

## 2. Claude mit GitHub verbinden

1. claude.ai/code öffnen und mit deinem Claude-Konto anmelden.
2. Beim ersten Start die **Claude GitHub App** installieren und ihr Zugriff auf das Repo `budget` geben (nur dieses Repo auswählen).

## 3. Cloud-Umgebung einrichten

In claude.ai/code eine Umgebung „budget“ anlegen:

- **Netzwerk:** „Trusted“ (reicht für GitHub und npm).
- **Umgebungsvariablen:** keine.
- **Setup-Skript** (läuft vor jeder Sitzung, wird zwischengespeichert):

```bash
#!/bin/bash
set -e
if [ -f package-lock.json ]; then npm ci; elif [ -f package.json ]; then npm install; fi
if [ -f package.json ] && grep -q '"@playwright/test"' package.json; then npx playwright install --with-deps chromium; fi
```

Node 22 ist in der Cloud vorinstalliert; die Spezifikation ist darauf ausgelegt.

## 4. Arbeiten mit Aufträgen

1. Neue Sitzung starten, Repo `budget` und Umgebung „budget“ wählen.
2. Modell wählen: **Sonnet** für die meisten Aufträge, **Opus** für P1d (Datenmodell) und P1e (Sicherheit) sowie für Reviews.
3. Den Text aus `docs/prompts/P1a.md` (ab der Linie) einfügen und starten.
4. Die Sitzung legt einen Branch an und öffnet einen Pull Request. Du prüfst ihn auf GitHub; bei Rückfragen antwortest du in der Sitzung.
5. Merge, dann nächster Auftrag. Reihenfolge: P1a → P1b und P1d (parallel möglich) → P1c → P1e.

Lokal weiterarbeiten: `claude --teleport <Sitzungs-ID>` holt eine Cloud-Sitzung samt Verlauf ins Terminal, oder du checkst einfach den Branch aus.

## 5. Fly.io für die neue App

The former Fly app was used only for the prototype and removed by the owner on 2026-10-01. The versioned reference remains available through `npm run proto`. The configured target is reported as deployed; its running commit, physical-device login and real encrypted restore still need verification. Legacy staging remains suspended and has not been approved for removal.

Die vollständige, geprüfte Reihenfolge steht in **`docs/ops.md`, Abschnitt 3 „First deploy checklist“**; hier wird sie bewusst nicht wiederholt. Kurzfassung, damit du weißt, was auf dich zukommt:

1. App, Volume und Objektspeicher (Tigris) anlegen, Setup-Code über stdin als Secret setzen.
2. **Erster Deploy von Hand** mit `fly deploy --ha=false` (genau eine Maschine).
3. **Erst danach** das Deploy-Token als `FLY_API_TOKEN` im GitHub-Environment `production` hinterlegen und den Branch-Schutz für `main` setzen (`docs/ops.md`, Abschnitt 10). Ab dann deployt jeder Merge auf `main`, dessen CI grün ist, automatisch.

Den App-Namen `budget-fg` kannst du ändern; dann auch `app`, `BUDGET_ORIGIN` und `BUDGET_RP_ID` in `fly.toml` (vor dem ersten Passkey).

## 6. Credits sparsam einsetzen

- Ein Auftrag = eine Sitzung. Nach dem Merge eine neue Sitzung starten statt die alte weiterzuführen; so bleibt der Kontext klein.
- Sonnet für Umsetzung, Opus gezielt für Datenmodell, Sicherheit und Reviews.
- Rückfragen der Sitzung kurz und entscheidend beantworten; unklare Produktfragen lieber hier im Desktop klären und in `PRODUCT.md`/`SPEC.md` festhalten.
- Den Verbrauch nach P1a ansehen und daraus hochrechnen, wie weit die Credits reichen.

## 7. Echte Daten

Import is no longer an app feature. Only CSV export of all accounts/portfolios stays in scope, currently as a placeholder. One-time EUR migration remains a separate owner-authorized Codex/Claude task using existing exports and the PP file in private storage. Establish file access and the transfer procedure for that task. Real exports/mappings are never committed or included in CI or logs. Bank consents are granted by the owner.
