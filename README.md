# Beauty Chic · Codespaces Control

Controllo Codespaces **senza GitHub Actions**, basato su un webhook GitHub privato
firmato e un Cloudflare Worker Free. Il repository contiene soltanto codice
di automazione, nessun dato del negozio né alcuna credenziale.

**STATO: predisposto, NON ancora distribuito/autorizzato su Cloudflare.**
Non puo' accendere Codespaces fino alla configurazione iniziale.

## Avvio iniziale (una sola sessione)

1. Aprire https://dash.cloudflare.com/ e selezionare Workers & Pages ->
   Create application -> Import repository (GitHub). Autorizzare solo
   `claudiomarino002/beautychic-codespace-control`.
2. Selezionare questo repository, branch `main`, worker name
   `beauty-chic-codespace-control`, deploy command `npx wrangler deploy`,
   quindi Save and Deploy. Non attivare Workers Paid.
3. Generare offline in un password manager un secret casuale di almeno
   32 byte. In Cloudflare Worker > Settings > Variables and Secrets
   aggiungere una SECRET chiamata `GITHUB_WEBHOOK_SECRET`. Deploy.
4. In GitHub, sul repository PRIVATO
   `claudiomarino002/beautify-your-shop`, aprire Settings > Webhooks >
   Add webhook: Payload URL =
   `https://<worker>.<subdomain>.workers.dev/github-webhook`;
   Content type application/json; Secret = quello del punto 3;
   individual event **Issue comments**; Active.
5. La chat inviera' un commento `BC_CODESPACE_PING_V1` nella PR PRIVATA
   #82; in GitHub > Settings > Webhooks > Recent Deliveries verificare
   HTTP 200 e `BC_SIGNED_WEBHOOK_PING_PASS`. Non serve nessun token
   Codespaces prima di questa prova.
6. Solo dopo la prova, generare un GitHub fine-grained PAT per il solo
   repository privato `beautify-your-shop`, permission
   **Codespaces lifecycle admin: Read and write**, scadenza definita.
   Non condividere mai il token nella chat, nei commenti o nelle immagini.
7. In Cloudflare Worker > Settings > Variables and Secrets creare una
   seconda SECRET `GITHUB_CODESPACE_TOKEN`, incollare il PAT, Deploy.
8. La chat richiedera' `BC_CODESPACE_START_V1` / `BC_CODESPACE_STOP_V1`
   come normali commenti nella PR privata #82; GitHub invia il webhook,
   Cloudflare autentica ed esegue il solo comando consentito via API.
   Nessun riavvio di PC o browser e nessun minuto GitHub Actions.

## Controlli
- La firma HMAC SHA-256 deve corrispondere ai byte originali del webhook.
- Numero di repository e account, PR #82, autore del commento, timestamp
  e stringhe comando sono allowlist fisse.
- Nessuna esecuzione di shell, deploy Lovable, checkout o scrittura al sito.
- Accensione/spegnimento accetta solo un Codespace fissato nel sorgente.
- Cloudflare Workers Free puo' interrompere richieste oltre la quota gratuita.
- Le consegne duplicate entro 5 minuti non hanno ancora deduplicazione
  durevole: possibile doppia chiamata di start/stop (rischio da validare).
- GitHub Codespaces mantiene quote proprie; non tentiamo keepalive.
- Dopo l'accensione, il bridge **non e' ancora garantito headless**: la
  privata PR #82 deve essere verificata e autorizzata separatamente.
- Nessun audit indipendente di Claude e' stato ancora eseguito.

Test offline: `node --test src/index.test.mjs` (Node 20+).
Nella preparazione: 10 test di sicurezza in sandbox locale superati.
Questo non equivale al test reale Cloudflare/GitHub.

Riferimenti ufficiali:
- https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/
- https://developers.cloudflare.com/workers/configuration/secrets/
- https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
- https://docs.github.com/en/rest/codespaces/codespaces

## Stato del vecchio controller
Il precedente workflow pubblico GitHub Actions e' stato disattivato prima
di qualsiasi esecuzione. **Non usare Actions per questo progetto.**
