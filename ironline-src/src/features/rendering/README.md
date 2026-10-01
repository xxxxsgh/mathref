# Feature `rendering`

Iluminação global e compositor HDR do IRONLINE. Tudo procedural, sem assets.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `index.js` | feature: presets de qualidade, pipeline (`ctx.setRenderPipeline`), serviço |
| `Atmosphere.js` | céu físico (sky-view LUT Rayleigh/Mie/ozônio), nuvens fbm, disco solar, PMREM |
| `Shadows.js` | sombra do sol ajustada à câmera, snap de texel, bias por texel |
| `SkyOcclusion.js` | mapa de altura visto de cima → oclusão de céu (interiores) |
| `SunView.js` | vistas ortográficas do sol: RSM (GI de 1 rebatimento) e cascata larga de sombra |
| `LocalProbe.js` | cubemap HDR da cena na posição do jogador → PMREM → reflexos/IBL da viewmodel |
| `Dust.js` | poeira em suspensão que só brilha dentro dos feixes de sol |
| `LensDirt.js` | textura procedural de sujeira de lente |
| `shaders.js` | AO, blur bilateral, volumétrico, combine, bloom, exposição, tonemap, final |
| `FsQuad.js` | triângulo de tela cheia e helpers de alvo/material |

## Pipeline (por frame)

0. Vistas do sol (sob demanda): RSM 256² com os materiais reais (cada texel
   = luz secundária) e cascata larga de sombra (380 m, depth). Sonda local
   (cubemap 128² → PMREM) para a viewmodel quando o jogador anda.
   Shadow map do sol (4096² em high) re-renderizado só quando o frustum
   muda ou a cada 2 quadros (objetos móveis).
1. Cena do mundo → alvo HDR (HalfFloat, depth em textura), com jitter
   subpixel de Halton quando o TAA está ligado (high/ultra; MSAA só em
   medium/ultra).
2. Viewmodel → alvo próprio com α (pré-multiplicado), mesmo jitter.
3. AO ½ res em duas escalas (anel largo + anel de contato) + blur bilateral.
4. GI ¼ res: junta os VPLs do RSM (irradiância com cossenos nos dois lados;
   sob teto só valem VPLs também cobertos — luz que entrou pela janela).
5. Volumétrico ½ res: raymarch do shadow map E do depth do RSM (o RSM vê
   tudo, inclusive o que não projeta sombra); ar mais empoeirado sob teto.
6. Combine: estima o albedo (cor ÷ (ambiente + sol·N·L·vis/π)) e soma as
   DIFERENÇAS de luz — AO só no ambiente, GI quente, sombra larga onde a
   cascata curta não chega, sombras de contato em espaço de tela, interior
   com ambiente reduzido e mais quente; névoa de altura com espalhamento de
   Mie do sol; god rays; viewmodel com DOF de ADS.
7. TAA: reprojeção pelo depth (vizinho mais próximo), histórico Catmull-Rom,
   recorte por variância em YCoCg; viewmodel presa à tela. No modo shot a
   média é progressiva (supersample limpo).
8. Bloom (13-tap Jimenez + tenda), exposição automática (média log ponderada).
9. Tonemap: micro-contraste, bloom, sujeira de lente (só fontes fortes),
   aberração cromática, ACES, gradação (WB, contraste, saturação,
   split-toning frio/quente, lift/gain), vinheta → sRGB.
10. Final: FXAA (low) ou nitidez CAS, grão de filme, dithering.

## Para outras features

- **HDR**: o buffer é linear e sem limite. Clarões, traçantes, janelas
  acesas devem usar cores > 1 (ex.: `color.setScalar(6)` ou
  `emissiveIntensity` alto) para florescer no bloom e acender a sujeira de
  lente. Valores ≤ 1 quase não florescem.
- **Viewmodel**: renderizada num alvo separado e composta por cima; recebe
  `scene.environment` = céu (reflexos), se a weapon não definir o seu.
  `services.weapon.ads` (0..1) liga o DOF periférico da arma.
- **Céu**: se `scene.background` for `Color`/`null`, o céu físico assume e
  esconde `services.world.sky` (céu, IBL e névoa saem do MESMO modelo).
  `?sky=world` mantém o céu do world. A direção do sol vem SEMPRE de
  `services.world.sun` (posição − alvo); a intensidade também.
- **Névoa**: `scene.fog` é substituída pela névoa de altura do compositor.
- Objetos que não devem ocluir o céu: `obj.userData.noSkyOcclusion = true`
  (transparentes, pontos e linhas já são ignorados).

## Serviço `ctx.services.rendering`

`setExposure(v)`, `environment`, `environmentIntensity` (get/set),
`sunDirection`, `sunColor`, `sunTransmittance`, `setFog`, `setVolumetrics`,
`setAO`, `setBloom`, `setGrade`, `setLens`, `setAutoExposure`, `setSky`,
`setMenuBlur(0..1)`, `flash(v)`, `setGI({strength, radius})`, `setContact(v)`,
`setTAA({alpha, gamma})`, `ambient` (radiância ambiente estimada),
`setDebug('ao'|'vol'|'depth'|'bloom'|'occ'|'gi'|'albedo'|null)`,
`params`, `stats`, `readExposure()`.

## Qualidade / orçamento

| Preset | AA | AO | GI (RSM) | Volumétrico | Contato | Sombra próxima | Motion blur | Poeira |
|---|---|---|---|---|---|---|---|---|
| low | FXAA | — | — | — | — | 1024² / 30 m | — | — |
| medium | MSAA 4× + CAS | 10 amostras | 12 | — | sim | 2048² / 34 m | — | — |
| high | TAA + CAS | 14 | 16 | 20 passos | sim | 4096² / 38 m | sim | 700 |
| ultra | TAA + MSAA 4× | 18 | 24 | 28 passos | sim | 4096² / 46 m | sim | 1100 |

Todas usam a cascata larga de sombra (1024² low/medium, 2048² high/ultra).

Alvo em GPU intermediária, 1080p/high: ≤ 4,5 ms de pós (AO 0,6 · GI ¼ res
0,4 · volumétrico 0,7 · combine 0,8 · TAA 0,4 · bloom 0,5 · tonemap+final
0,5). LUT do céu e PMREM só quando o sol muda; oclusão de céu a cada ~30
frames ou ~16 m; RSM a cada 6 frames ou ~1,4 m; cascata larga a cada ~15 m;
sonda local a cada ~1,5 m / 3 s. O shadow map de 4096² é o passe mais caro
no SwiftShader — por isso é re-renderizado sob demanda.
