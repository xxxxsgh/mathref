# Feature `rendering`

Iluminação global e compositor HDR do IRONLINE. Tudo procedural, sem assets.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `index.js` | feature: presets de qualidade, pipeline (`ctx.setRenderPipeline`), serviço |
| `Atmosphere.js` | céu físico (sky-view LUT Rayleigh/Mie/ozônio), nuvens fbm, disco solar, PMREM |
| `Shadows.js` | sombra do sol ajustada à câmera, snap de texel, bias por texel |
| `SkyOcclusion.js` | mapa de altura visto de cima → oclusão de céu (interiores) |
| `Dust.js` | poeira em suspensão que só brilha dentro dos feixes de sol |
| `LensDirt.js` | textura procedural de sujeira de lente |
| `shaders.js` | AO, blur bilateral, volumétrico, combine, bloom, exposição, tonemap, final |
| `FsQuad.js` | triângulo de tela cheia e helpers de alvo/material |

## Pipeline (por frame)

1. Cena do mundo → alvo HDR (HalfFloat, MSAA 4×, depth em textura).
2. Viewmodel → alvo próprio com α (pré-multiplicado), sem tocar no depth do mundo.
3. AO ½ res (SAO em espiral, normais do depth) + blur bilateral.
4. Volumétrico ½ res: raymarch do shadow map do sol (god rays); ar mais
   empoeirado sob teto (via oclusão de céu).
5. Combine: motion blur de câmera, AO, oclusão de céu (interiores escuros,
   sol direto preservado), névoa de altura + perspectiva aérea com a cor do
   céu, in-scattering do sol, viewmodel por cima com DOF de ADS na periferia.
6. Bloom (13-tap Jimenez + tenda), exposição automática (média log ponderada).
7. Tonemap: micro-contraste, bloom, sujeira de lente (só fontes fortes),
   aberração cromática, ACES, gradação (WB, contraste, saturação,
   split-toning, lift/gain), vinheta → sRGB.
8. Final: FXAA (low) ou nitidez CAS, grão de filme, dithering.

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
`setMenuBlur(0..1)`, `flash(v)`, `setDebug('ao'|'vol'|'depth'|'bloom'|'occ'|null)`,
`params`, `stats`, `readExposure()`.

## Qualidade / orçamento

| Preset | MSAA | AO | Volumétrico | Bloom | Motion blur | Poeira | AA final |
|---|---|---|---|---|---|---|---|
| low | — | — | — | 5 níveis (sem bloom) | — | — | FXAA |
| medium | 4× | 8 amostras | — | 6 níveis | — | — | CAS |
| high | 4× | 12 | 20 passos | 6 | sim | 700 | CAS |
| ultra | 4× | 16 | 28 passos | 7 | sim | 1100 | CAS |

Alvo em GPU intermediária, 1080p/high: ≤ 3,5 ms de pós. LUT do céu e PMREM
só quando o sol muda; oclusão de céu re-renderizada a cada ~30 frames ou
quando a câmera anda ~16 m.
