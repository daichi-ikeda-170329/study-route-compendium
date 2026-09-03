/**
 * 役割（stage）どうしの接続。「次に進む本」の生成に使う。
 *
 * これを持たずに STAGES の並び順だけで「自分より後ろの役割」を接続先にすると、
 * 役割が 2 つ以上離れた本まで拾ってしまう。英語では英文解釈のページに英作文の本が
 * 「次に進む本」として並んでいた（解釈 → 英作文は積み上げの順序ではなく別トラック）。
 *
 * ここに書くのは**学習順として実際に接続する役割だけ**。並行トラック
 * （英語のリスニング・英作文、社会の資料集など）は、そこへ入る接続を持たない。
 * それらの本はルート画面の並行枠と図鑑から辿る。
 *
 * 科目トップの STAGES にキーを足したら、ここにも足す。足し忘れは
 * build/check-site.mjs の「役割の接続表に無いキー」で落ちる。
 */
export const STAGE_FLOW = {
  english: {
    tango: ['jukugo', 'bunpo'],
    jukugo: ['bunpo', 'kaishaku'],
    bunpo: ['kaishaku', 'eisaku'],
    kaishaku: ['chobun'],
    chobun: ['kyotest', 'kako'],
    eisaku: ['kako'],
    listening: ['kyotest', 'kako'],
    kyotest: ['kako'],
    kako: [],
  },
  japanese: {
    intro: ['know'],
    know: ['core'],
    core: ['std'],
    std: ['adv', 'kyotest'],
    adv: ['kako'],
    kyotest: ['kako'],
    kako: [],
  },
  math: {
    intro: ['calc', 'core'],
    calc: ['core'],
    core: ['std'],
    std: ['adv', 'kyotest'],
    adv: ['field', 'kako'],
    field: ['kako'],
    kyotest: ['kako'],
    kako: [],
  },
  science: {
    intro: ['know', 'core'],
    know: ['core'],
    core: ['std'],
    std: ['adv', 'kyotest'],
    adv: ['kako'],
    kyotest: ['kako'],
    kako: [],
  },
  social: {
    text: ['intro'],
    intro: ['know'],
    know: ['core'],
    shiryo: ['core'],
    core: ['std'],
    std: ['adv', 'kyotest'],
    adv: ['kako'],
    kyotest: ['kako'],
    kako: [],
  },
  joho: {
    kogi: ['know'],
    know: ['enshu'],
    enshu: ['kyotest'],
    kyotest: ['kako'],
    kako: [],
  },
  shoron: {
    intro: ['kata'],
    kata: ['neta', 'enshu'],
    neta: ['enshu'],
    enshu: ['gakubu'],
    gakubu: ['kako'],
    kako: [],
  },
};

/** この役割の次に来る役割。表に無いキーは接続先なしとして扱う */
export function nextStages(dir, stage) {
  return STAGE_FLOW[dir]?.[stage] || [];
}
