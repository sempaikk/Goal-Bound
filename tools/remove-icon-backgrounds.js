/**
 * Ferramenta pra remover o fundo (branco/claro) dos ícones dos
 * personagens em data/icons/, deixando eles transparentes.
 *
 * Por que não dá pra simplesmente "trocar todo pixel branco por
 * transparente": os desenhos usam preto e branco puros tanto no
 * fundo quanto no próprio personagem (rosto, cabelo claro, dentes,
 * parte da roupa) - um filtro por cor simples apagaria o desenho
 * junto com o fundo.
 *
 * Como funciona de verdade: flood fill (preenchimento por
 * propagação) a partir das bordas da imagem. A ideia é simples:
 * só o fundo de verdade está "conectado" à borda da imagem sem
 * interrupção. Qualquer área branca que faça parte do desenho (ex:
 * o rosto) fica cercada por linhas pretas de contorno, então o
 * algoritmo nunca consegue "entrar" nela vindo de fora - ele para
 * exatamente no contorno.
 *
 * Detalhes que fazem a diferença entre funcionar bem ou estragar o
 * desenho:
 *
 * 1. A cor de referência do fundo é a cor MAIS FREQUENTE nas bordas
 *    da imagem (moda), não a média. Se uma pontinha do cabelo tocar
 *    a borda da imagem, a média fica puxada pra um tom mais escuro
 *    que o fundo real - a moda ignora essa minoria de pixels.
 *
 * 2. A comparação de cada pixel é sempre contra essa MESMA cor fixa
 *    de referência - nunca contra o pixel vizinho já processado. Se
 *    fosse contra o vizinho, o algoritmo "vazaria" gradualmente
 *    através dos pixels de anti-serrilhamento (tons intermediários
 *    de cinza que ficam na borda entre o preto do contorno e o
 *    branco do fundo) e acabaria comendo partes do desenho que
 *    deveriam ficar intactas.
 *
 * 3. PAREDE DE CONTORNO (o que resolve o caso do cabelo branco do
 *    Shidou sobre fundo branco): contornos finos e diagonais (tipo
 *    ziguezague de cabelo espetado) têm "vãos" na diagonal quando
 *    testados com vizinhança de 4 direções (cima/baixo/esquerda/
 *    direita) - dois pixels pretos vizinhos só na diagonal NÃO se
 *    tocam nessa vizinhança, e o flood fill escapa por esse buraco
 *    entre eles, como se o contorno tivesse um furo que ele não tem
 *    de verdade. A correção: identifica todo pixel escuro (contorno)
 *    e "engorda" essa máscara em 1px (dilatação, olhando as 8
 *    direções) antes do flood fill - isso fecha os vãos diagonais e
 *    transforma o contorno numa parede sólida de verdade, que o
 *    flood fill nunca atravessa, mesmo que a cor dos dois lados do
 *    "vão" batesse com a tolerância de fundo.
 *
 * USO:
 *   node tools/remove-icon-backgrounds.js
 *
 * Processa a partir de data/icons_original_backup/ (nunca a partir de
 * data/icons/, que já pode estar sem fundo de uma rodada anterior -
 * reprocessar um ícone já transparente iria degradar ele, não
 * corrigir nada). Se o backup ainda não existir pra um ícone, o
 * arquivo atual de data/icons/ é copiado pra lá antes, virando a nova
 * fonte da verdade.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ICONS_DIR = path.join(__dirname, '..', 'data', 'icons');
const BACKUP_DIR = path.join(__dirname, '..', 'data', 'icons_original_backup');

// Distância euclidiana máxima em RGB (0-441) pra um pixel ainda ser
// considerado "fundo". 40 foi validado visualmente nos 13 ícones
// atuais do projeto.
const DEFAULT_TOLERANCE = 40;

// Um pixel conta como "contorno escuro" (parede) se a média dos 3
// canais RGB for menor que isso. Calibrado pra pegar as linhas pretas
// do traço (perto de 0) sem pegar a sombra pontilhada cinza-claro
// usada no sombreado do rosto/roupa (bem mais clara que isso).
const DARK_OUTLINE_THRESHOLD = 110;

async function removeBackground(inputPath, outputPath, tolerance = DEFAULT_TOLERANCE) {
  const image = sharp(inputPath).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const idx = (x, y) => (y * width + x) * channels;

  // 1. Cor de fundo = moda (cor mais frequente) entre os pixels da borda
  const colorCounts = new Map();
  const countColor = (x, y) => {
    const i = idx(x, y);
    const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
    colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
  };
  for (let x = 0; x < width; x++) {
    countColor(x, 0);
    countColor(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    countColor(0, y);
    countColor(width - 1, y);
  }

  let bgColor = [255, 255, 255];
  let maxCount = 0;
  for (const [key, count] of colorCounts) {
    if (count > maxCount) {
      maxCount = count;
      bgColor = key.split(',').map(Number);
    }
  }

  const colorDist = (i) => {
    const dr = data[i] - bgColor[0];
    const dg = data[i + 1] - bgColor[1];
    const db = data[i + 2] - bgColor[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };

  // 2. Máscara de contorno escuro + dilatação de 1px (8 direções) pra
  // fechar vãos diagonais.
  const isDarkRaw = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(x, y);
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (avg < DARK_OUTLINE_THRESHOLD) {
        isDarkRaw[y * width + x] = 1;
      }
    }
  }

  const isWall = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isDarkRaw[y * width + x]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          isWall[ny * width + nx] = 1;
        }
      }
    }
  }

  // 3. Flood fill (BFS) a partir da borda, sempre contra a cor fixa de
  // fundo, e nunca atravessando a parede de contorno dilatada.
  const visited = new Uint8Array(width * height);
  const queue = [];

  const trySeed = (x, y) => {
    const pixelIndex = y * width + x;
    if (visited[pixelIndex] || isWall[pixelIndex]) return;
    if (colorDist(idx(x, y)) <= tolerance) {
      visited[pixelIndex] = 1;
      queue.push([x, y]);
    }
  };

  for (let x = 0; x < width; x++) {
    trySeed(x, 0);
    trySeed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    trySeed(0, y);
    trySeed(width - 1, y);
  }

  let head = 0;
  while (head < queue.length) {
    const [x, y] = queue[head++];
    const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const pixelIndex = ny * width + nx;
      if (visited[pixelIndex] || isWall[pixelIndex]) continue;
      if (colorDist(idx(nx, ny)) <= tolerance) {
        visited[pixelIndex] = 1;
        queue.push([nx, ny]);
      }
    }
  }

  // 4. Aplica alpha=0 em todo pixel marcado como fundo
  let removedCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIndex = y * width + x;
      if (visited[pixelIndex]) {
        data[idx(x, y) + 3] = 0;
        removedCount++;
      }
    }
  }

  await sharp(data, { raw: { width, height, channels } }).png().toFile(outputPath);

  return {
    bgColor,
    removedPercent: ((removedCount / (width * height)) * 100).toFixed(1)
  };
}

async function main() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  // Sempre processa a partir do backup do original - nunca do que já
  // está em data/icons/, que pode já estar sem fundo de uma rodada
  // anterior (reprocessar isso degradaria a imagem, não corrigiria
  // nada). Se algum ícone em data/icons/ ainda não tem backup (projeto
  // novo, ou ícone adicionado depois), o arquivo atual vira o backup
  // agora, assumindo que ainda é o original com fundo.
  const currentIconFiles = fs.readdirSync(ICONS_DIR).filter(f => /\.(png|jpe?g)$/i.test(f));
  for (const file of currentIconFiles) {
    const backupPath = path.join(BACKUP_DIR, file);
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(path.join(ICONS_DIR, file), backupPath);
    }
  }

  const files = fs.readdirSync(BACKUP_DIR).filter(f => /\.(png|jpe?g)$/i.test(f));

  console.log(`Processando ${files.length} ícone(s) a partir de ${BACKUP_DIR}...\n`);

  for (const file of files) {
    const inputPath = path.join(BACKUP_DIR, file);
    const outputName = file.replace(/\.jpe?g$/i, '.png');
    const outputPath = path.join(ICONS_DIR, outputName);

    const result = await removeBackground(inputPath, outputPath);
    console.log(`✅ ${file} -> ${outputName} | fundo detectado: rgb(${result.bgColor.join(',')}) | ${result.removedPercent}% removido`);
  }

  console.log('\nPronto! Os ícones originais continuam intactos em data/icons_original_backup/ - pode rodar de novo quando quiser sem medo de degradar nada.');
}

main().catch(err => {
  console.error('Erro ao remover fundos:', err);
  process.exit(1);
});
