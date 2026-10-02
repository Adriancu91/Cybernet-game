# CyberNet: AI Academy — Cărți, Laborator AI și Alianțe

Un joc de strategie și comerț pentru browser, pentru un singur jucător, cu aspect de terminal cyberpunk. Toți ceilalți „jucători” sunt boți simulați: se antrenează, concurează în arenă, fac comerț cu cărți, cumpără teren și conduc bresle. Jocul este integral în limba română.

**Joacă:** deschide `index.html` într-un browser sau activează GitHub Pages (Settings → Pages → Deploy from branch → `main` / root).

## Ce conține

| Sistem | Pe scurt |
|---|---|
| AI de companie | IQ la matematică, bază de date de cultură generală, viteză de procesare (ms, minim 150 ms). Antrenamentul folosește Tokeni de date (DT), cu randament descrescător peste un plafon pe ligă. |
| Standuri de antrenament | De la x2 la x10 pe terenul tău, maximum 3, întreținere pe oră, nivelurile superioare depind de ligă. |
| Arenă | Solo (10 runde, 3 vieți, stamina) și Multiplayer (5–9 boți apropiați de ratingul tău, runde live, premiul împărțit după scor). 2 intervenții umane (Human Override) pe meci. |
| Ligi | Bronz → Argint → Aur → Platină → Diamant → Neural. Întrebări mai grele, boți mai puternici, recompense mai mari. |
| Cărți | 4 tipuri echilibrate (Nucleu, Memorie virtuală, Hardware, Răcitor), fiecare cu o statistică principală fixă. Rarități de la Comună la Legendară, plus **Unică** (doar din Laboratorul AI). Îmbunătățire de la +0 la +4 cu CR și fragmente, apoi evoluție la raritatea următoare. 1–4 bonusuri aleatorii în funcție de raritate (Unică: 5), regenerabile cu un Recalibrator neural. O carte echipată pe tip; setul complet dă bonus; Nucleul și Hardware-ul produc căldură, Răcitorul o elimină. Album de cărți cu recompense. Fiecare carte este desenată procedural din propriul ADN. |
| Laborator AI | AI-ul pune întrebări în română, jucătorul răspunde cu propriile cuvinte. Energie +1/h (maximum 3), plus din victoriile la quiz. La fiecare lecție: 1 Recalibrator neural garantat, CR și fragmente pentru răspunsurile utile, 35% șansă la o carte, șansă la o carte Unică cu garanție după un număr de lecții. Offline folosește o bancă locală și salvează răspunsurile pentru export; `js/ai_bridge.js` + `docs/AI_BRIDGE.md` descriu cum se conectează AI-ul real. |
| Conturi în cloud | Salvare doar cu ID + PIN (fără e-mail). Progresul te urmează pe orice dispozitiv; conflictele dintre dispozitive sunt întrebate, niciodată suprascrise pe tăcute. Backend gratuit Supabase: `supabase/setup.sql`, pașii de configurare în `docs/CLOUD_SETUP.md`. Fără el, jocul salvează pe dispozitiv ca înainte. |
| Plasă de siguranță pentru venit | Bonus zilnic de conectare cu serie de 7 zile (CR, DT, fragmente), antrenament gratuit la fiecare 10 minute (răspunzi singur la 5 întrebări, fără stamina, fără taxă), credite de urgență când nu poți plăti taxa de Multiplayer (la fiecare 4 h). Nimeni nu rămâne blocat fără CR. |
| Quiz live | Întrebări noi în fiecare zi generate din Wikidata (capitale, elemente chimice), cu denumiri în română, păstrate 24 h și amestecate cu banca internă; offline se folosește doar banca locală. |
| Bresle | Taxă de 10% emisă ca bonus, sediu de breaslă (5 niveluri), elemente cosmetice (teme, fonturi, insigne). |
| Piață | Piața de cărți + propriul tău stand de piață, cu comision de 2% la tranzacțiile care trec prin el. |
| Server global | Prețul terenului crește odată cu raritatea lui; sub 50% spațiu liber construcțiile mari se blochează 60 s, apoi capacitatea crește cu 50%. |
| Pe termen lung | Sezoane de 14 zile, misiuni zilnice, evenimente săptămânale, 40 de realizări, clasamente, renaștere neurală (prestigiu). |

Progresul offline este simulat pentru maximum 8 ore când revii.

## Structura codului

```
index.html        scheletul paginii
css/style.css     temă, aranjare, reguli responsive
js/config.js      TOATE valorile de echilibru (modifică aici pentru reechilibrare)
js/core.js        RNG cu sămânță, stare, monede, jurnal, salvare/încărcare
js/data.js        banca de întrebări (230 de întrebări, multe despre România), nume
js/questions.js   generator de calcule + alegerea întrebărilor de cultură generală
js/sim.js         lume, AI de companie, bonusuri și plafoane, standuri, teren, server, pas de simulare
js/cards.js       cărți: emitere, statistici, îmbunătățire, evoluție, regenerare bonusuri, căldură, album, migrarea salvărilor NFT v1
js/livequiz.js    întrebări zilnice din Wikidata
js/ai_bridge.js   punctul de conectare pentru AI-ul real (offline implicit)
js/ailab.js       lecțiile Laboratorului AI, recompense, banca locală de întrebări, filtru de confidențialitate
js/cloud.js       salvare în cloud cu ID + PIN (CLOUD_CONFIG: URL Supabase + cheie anon)
supabase/setup.sql  tabelele bazei de date + funcții verificate cu PIN (se lipesc în Supabase SQL Editor)
js/guild.js       simularea breslelor, sediu, elemente cosmetice
js/market.js      piața boților, ofertele jucătorului, standul de piață
js/meta.js        misiuni, realizări, sezoane, prestigiu, clasamente
js/arena.js       meciuri, modelul de răspuns al AI-ului, intervenția umană, rating
js/actions.js     fiecare acțiune a jucătorului (validare -> plată -> aplicare -> jurnal)
js/art.js         grafică SVG procedurală: cărți, AI de companie, embleme, iconițe, hartă, grafice
js/tests.js       autoteste
js/ui.js          afișare și interacțiune
js/main.js        pornire, bucla jocului, recuperare offline, salvare automată
tests/run.js      rulează autotestele în Node
```

## Teste

```
node tests/run.js          # suita completă
node tests/run.js --quick  # mai rapid
```

În joc: atinge logo-ul de 5 ori (sau apasă tasta backtick, ori deschide cu `?debug=1`) pentru panoul de depanare: viteza timpului, trucuri pentru testare, statistici economice și autotestele.
