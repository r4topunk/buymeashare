# Vídeo de demo: Buy Me a Share (Stocklana)

## TL;DR

- Vídeo: `out/buymeashare-demo.mp4`, 1920x1080, 60 fps, **2:26**, sem áudio. A prévia com voz provisória é `out/buymeashare-demo-scratch-vo.mp4`.
- Duas vozes em primeira pessoa: **feminina = a criadora** (recebe as gorjetas), **masculina = o fã** (doa). Os nomes dos tokens não são citados (só "Tessera pre-IPO tokens").
- Estrutura em 4 partes: **1. o criador** monta o pote · **2. o fã** conecta a carteira e dá a gorjeta · **3. o criador** resgata · **4. prova real** na mainnet.
- Narração pro TTS: `tts-narration.md` (16 blocos, cada um com o tempo em que começa e a duração máxima). Depois: `node capture/mux-voice.mjs`.
- As partes 1–3 usam o modo demo do app com uma carteira de teste ("Demo Wallet"): conectar e aprovar acontecem na UI de verdade, mas nada é enviado pra rede. A parte 4 é real (pote na mainnet + tx no Solana Explorer).

```fish
# 0. build do app com as flags de demo (fora do repo, pra não mexer no dev server)
set R /tmp/bmas-rec; rsync -a --delete --exclude node_modules --exclude .next app/ $R/
cd $R; pnpm install --offline --frozen-lockfile; NEXT_PUBLIC_DEMO_FLAGS=1 pnpm exec next build; pnpm exec next start -p 3200 &

# 1. gravar (~6 min, em câmera lenta) e 2. montar (~3 min)
cd video/capture
set -x PLAYWRIGHT ~/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs
node capture.mjs
node render.mjs                 # --from 40 --to 60 gera só uma prévia desse trecho

# 3a. voz em clipes separados (video/tts/<id>.mp3)
node mux-voice.mjs

# 3b. voz num arquivo só (como a take v2, duas vozes), com legenda karaokê queimada no vídeo
python3 karaoke.py ../tts/full-v2.mp3 > ../out/captions.json   # tempo de cada palavra
node render.mjs --captions ../out/captions.json
ffmpeg -y -i ../out/buymeashare-demo.mp4 -i ../tts/full-v2.mp3 -filter_complex "[1:a]aresample=48000,loudnorm=I=-16:TP=-1.5:LRA=11,apad[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart ../out/buymeashare-demo-final.mp4
```

## Regras do Stocklana (verificadas em 24/09)

| Item | Regra oficial |
|---|---|
| Entrega | Pelo menos um link: GitHub, demo ao vivo **ou** vídeo |
| Formato/duração | Não especificados (2–4 min é o costume entre participantes) |
| Prazo | **25/09/2026, 16h ET (17h BRT)**; dá pra editar até fechar |
| Critério | "could this be a real app that people will actually use?" · demo ponta a ponta · por que Solana · execução |

## Roteiro

| Começa | Voz | Parte | Tela | Narração (EN, vai pro TTS) |
|---|---|---|---|---|
| 0:01 | ♂ narrador | — | Cartela de abertura: moedas O/K/S, "Buy Me a Share", "Tip a creator. They get pre-IPO exposure." | This is Buy Me a Share. |
| 0:06 | ♀ criadora | Part 1 · Creator | Cartela "Part 1 · The creator". Landing: o cursor para no título e clica no pote | I'm a creator, and this is how I receive tips: my fans send me Tessera pre-IPO tokens, not cash. |
| 0:16 | ♀ criadora | Part 1 · Creator | "Select Wallet" → modal do app → "Demo Wallet" → popup "Connect to this site?" → Connect (clique normal, sem zoom). O header passa a mostrar BV2K…iNRg | My Solana wallet is my account. No signup, no password. |
| 0:23 | ♀ criadora | Part 1 · Creator | "Create your link" → zoom no formulário → "Use connected wallet" → digita Maya e maya → o link aparece | I add my name and my X handle, and my tip link is ready. The link is my wallet, so there's no database. |
| 0:33 | ♀ criadora | Part 1 · Creator | Rola até o card de compartilhamento (zoom) → "Copy link" | My followers see this card on X, and the same link works as a Solana Blink. |
| 0:43 | ♂ fã | Part 2 · Fan | Cartela "Part 2 · The fan". Corte pra página de gorjeta da Maya (pote vazio, selo unverified) | Now I'm the fan. I open the creator's link: the jar is empty. |
| 0:50 | ♂ fã | Part 2 · Fan | O fã conecta a própria carteira (H4KB…YB9Q) pelo mesmo modal + popup | One click, and my wallet is connected. |
| 0:56 | ♂ fã | Part 2 · Fan | Zoom no formulário: T-Kalshi → T-SpaceX → T-OpenAI, $5 → $3, SOL → USDC | I pick the pre-IPO token I want to give, at its live Jupiter price: three dollars in USDC. |
| 1:06 | ♂ fã | Part 2 · Fan | "Tip $3.00" → popup "Approve tip" (You pay 3 USDC · Maya gets ≈ 0.0029 T-OpenAI) → Approve → zoom no pote e a moeda cai | I approve once. Jupiter swaps my USDC into the token and sends it straight to the creator. |
| 1:16 | ♂ fã | Part 2 · Fan | "Tip again" → liga "Lock it" → zoom no aviso da Tessera → "Demo (2 minutes)" → Tip $5 → popup "Approve locked tip" → moeda selada | I can also lock a tip, so the creator holds it. Before approving, I see Tessera's redemption warning and a small refundable deposit. Here, the lock is two minutes. |
| 1:34 | ♀ criadora | Part 3 · Creator | Cartela "Part 3 · Payday". Corte pro pote da Maya, que conecta a carteira; total $2.99, holdings e contagem da trava (zoom) | Back on my side, I open my jar: what I've received, my tip history, and the locked tip counting down. |
| 1:46 | ♀ criadora | Part 3 · Creator | "Claim" → popup "Claim locked tip" → Approve → o selo quebra (zoom no pote) | When a lock opens, I claim it, and the tokens are mine. |
| 1:52 | ♂ fã | Part 3 · Fan | Corte pra "Your locked-tip deposits" com o fã conectado → "Reclaim deposit" → popup → Approve | And I get my escrow deposit back. |
| 2:00 | ♀ criadora | Part 4 · Mainnet | Cartela "Part 4 · Live on mainnet". Pote real DrPUR2… ($1.00 em T-OpenAI, gorjeta de 24/09) → "tx ↗" → Solana Explorer (Success) | This isn't a mockup. It's live on Solana mainnet: this jar got its first real tip on September 24th, in a single transaction. |
| 2:10 | ♂ fã | Part 4 · Mainnet | Zoom em Fee (0.000011 SOL) e em "893 bytes, max 1,232" | Swap, escrow and transfer in one transaction, for a fraction of a cent. Only on Solana. |
| 2:19 | ♂ narrador | — | Cartela final: "Buy Me a Share", buymeashare.r4to.com, fade | Buy Me a Share. Tip a creator in pre-IPO exposure, with one link. |

## Como o vídeo é feito

| Peça | O que faz |
|---|---|
| `capture/narration.json` | Texto de cada bloco, cartelas e etiquetas (part/step). A duração da voz provisória define o ritmo da gravação |
| `capture/wallet.js` | Carteira Wallet Standard ("Demo Wallet") que o modal do app detecta; popup estilo extensão pra Connect/Approve. Não assina nada: o modo demo do app chama `window.__bmasDemoSign` e espera o Approve |
| `capture/page.js` | Esconde o cursor real e as scrollbars, troca localhost pelo domínio, reporta o tipo de cursor e pinta uma faixa de timecode de 4 px abaixo da área visível |
| `capture/clock.js` | Câmera lenta: os relógios da página (performance.now, Date, rAF, timers, animações CSS/WAAPI, scroll suave) correm a 0,4x durante a gravação |
| `capture/capture.mjs` | Playwright + Chromium na GPU com fator de escala 2 real (o screencast só entrega em 2x assim). Grava em câmera lenta (`--slowmo 0.4`): ~31 fps reais viram ~76 fps de tempo de página. Registra no relógio do Node o caminho do cursor, os cliques, os zooms, as cenas e os carregamentos (que viram cortes) |
| `capture/render.mjs` | Liga cada frame ao relógio pelo timecode, acelera a câmera lenta de volta e desenha a 60 fps constantes: fundo em gradiente, janela com barra de URL, página, cursor de Mac suave com anel de clique, zoom com easing, etiqueta "Part · step" com vidro fosco e cartelas animadas. 4 workers em paralelo + ffmpeg |
| `capture/karaoke.py` | Tempo de cada palavra da voz real: detecção de silêncio fina (trechos de fala exatos) + whisper por bloco + programação dinâmica que reparte as palavras do roteiro entre os trechos. A grafia vem do roteiro |
| `capture/mux-voice.mjs` | Coloca os clipes TTS nos tempos de `out/timecodes.json` e normaliza o volume (-16 LUFS) |
| App: `lib/demo.ts` | `DEMO_FLAGS` = dev **ou** build com `NEXT_PUBLIC_DEMO_FLAGS=1`. O Vercel não define a flag, então o código de demo continua fora de produção |

## Decisões

- **Câmera lenta na gravação** (0,4x) pras animações do pote (moeda, confete, física) saírem a ~60 fps: medido 47–59 frames distintos/s nas janelas de animação, contra o teto de 37 antes.
- **Sem zoom na aprovação da carteira:** é um clique comum. O zoom fica só no formulário, no pote, no aviso da Tessera e no Explorer.

- **Carteira de teste com nome neutro ("Demo Wallet")**, sem imitar Phantom ou outra marca real.
- **Build de produção pra gravar:** o modo dev do React travava as animações.
- **Solana Explorer em vez de Solscan** na parte 4: o Solscan mostra anúncios de cassino.

## UNKNOWN

- A trava e o claim só aparecem no modo demo; a tx real da parte 4 é um swap direto, sem trava.
- `docs/demo-script.md` (outra sessão) ainda descreve o roteiro antigo de 2 min com voz do fundador.
