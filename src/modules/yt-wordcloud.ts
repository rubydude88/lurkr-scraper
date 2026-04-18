import { ytCommentsData } from './state';
import { _wcUpdateSliderFill } from './wordcloud';
import { showError } from './ui';

let _ytWcDebounce: ReturnType<typeof setTimeout> | null = null;

export function ytGetWordCount(): number {
  const el = document.getElementById('yt-wc-words') as HTMLInputElement;
  const val = Number(el?.value || 120);
  const display = document.getElementById('yt-wc-words-value');
  if (display) display.textContent = String(val);
  return val;
}

export function ytGetFontScale(): number {
  const el = document.getElementById('yt-wc-font') as HTMLInputElement;
  const val = Number(el?.value || 100);
  const display = document.getElementById('yt-wc-font-value');
  if (display) display.textContent = String(val);
  return val / 100;
}

export function ytRegenerateWordCloud(): void {
  ytGenerateWordCloud(true);
}

function normalizeWord(w: string): string {
  return w.replace(/(.)\1{2,}/g, '$1');
}

const STOPWORDS = new Set([
  'the','is','are','am','was','were','be','been','being',
  'a','an','and','or','but','if','then','so','than','not','no',
  'of','to','in','on','for','with','as','by','at','from','into',
  'this','that','these','those','it','its','they','them','their',
  'you','your','we','our','i','me','my','he','she','his','her',
  'have','has','had','do','does','did','will','would','could','should',
  'can','may','might','shall','very','just','also','even','more',
  'some','any','all','each','both','too','up','out','now','here',
  'there','where','when','how','what','who','which','why','about',
  'like','get','got','let','make','made','good','really','much','many',
  'yang','dan','di','ke','dari','untuk','dengan','ini','itu','ada',
  'aku','kamu','dia','mereka','kita','kami','saya','lo','gue','lu',
  'ya','ga','nggak','gak','ngga','enggak','engga','nah','wah',
  'aja','kok','nih','deh','sih','lho','tuh','kan','tau','mau',
  'udah','sudah','lagi','masih','jadi','juga','pun','itu',
  'banget','bgt','tp','tapi','kalo','kalau','biar','bikin','sama',
  'si','lah','dong','kayak','kaya','kayaknya','seperti','kayanya',
  'nya','loh','yah','iya','iyaa','bisa','perlu','harus','terus',
  'gitu','gini','situ','sini','sana','cara','hal','banyak',
  'emang','memang','bakal','akan','belum','pernah','selalu',
  'kadang','mungkin','atau','karena','supaya','soal','pas','buat',
  'lebih','sangat','sekali','cuma','hanya','semua','setiap','beberapa',
  'namun','jika','apakah','gimana','kenapa','makanya','padahal',
  'walaupun','meskipun','setelah','sebelum','ketika',
  'terimakasih','makasih','thanks','thank','pliss','plis','please',
  'haha','hahaha','wkwk','wkwkwk','wkwkwkwk','hehe','hihi','xixi',
  'lol','omg','btw','fyi','asw','oke','ok','okay','yep','yup',
  'hai','hei','hey','hi','hello','bye','ciao',
  'www','http','https','com','org','net','id','co',
  'love','heart','fire','star',
  'kak','kakak','kk','om','tante','mas','mbak','pak','bu',
  'bang','abang','bro','sis','cuy','gan','bos','boss',
  'yg','yng','dgn','dg','krn','karna','utk','dlm',
  'sdh','blm','lg','lgi','msh',
  'jd','jg','jga','spy','bngt',
  'skrg','kmrn','bsk','tdk',
  'gw','w','u','km','kmu','mrk','dy',
  'woy','woi','bagus','keren','mantap','mantul','anjir','anjay','asik',
  'suka','follow','share','save','tag','komen',
  'iyo','iyaaa','nope','sip','siap','noted',
]);

function isValidWord(w: string): boolean {
  if (!w || w.length < 3) return false;
  if (STOPWORDS.has(w)) return false;
  if (/^\d+$/.test(w)) return false;
  if (/^(.)\1{2,}$/.test(w)) return false;
  if (!/[a-z]/.test(w)) return false;
  return true;
}

function tokenize(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/@[\w.]+/g, '')
    .replace(/#[\w]+/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/_/g, ' ')
    .split(/\s+/)
    .map(normalizeWord)
    .filter(isValidWord);
}

function ytBuildWordFreq(limit: number): { text: string; value: number }[] {
  const bigram  = (document.getElementById('yt-wc-bigram')  as HTMLInputElement)?.checked ?? false;
  const trigram = (document.getElementById('yt-wc-trigram') as HTMLInputElement)?.checked ?? false;
  const freq = new Map<string, number>();

  ytCommentsData.forEach(c => {
    const tokens = tokenize(c.text);
    tokens.forEach(w => freq.set(w, (freq.get(w) || 0) + 1));
    if (bigram) {
      for (let i = 0; i < tokens.length - 1; i++) {
        const bg = tokens[i] + ' ' + tokens[i + 1];
        freq.set(bg, (freq.get(bg) || 0) + 1);
      }
    }
    if (trigram) {
      for (let i = 0; i < tokens.length - 2; i++) {
        const tg = tokens[i] + ' ' + tokens[i + 1] + ' ' + tokens[i + 2];
        freq.set(tg, (freq.get(tg) || 0) + 1);
      }
    }
  });

  const all = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  const minFreq = all.length > 200 ? 2 : 1;
  return all.filter(([, v]) => v >= minFreq).slice(0, limit).map(([text, value]) => ({ text, value }));
}

export function ytGenerateWordCloud(force = false): void {
  if (!ytCommentsData.length) { showError('Fetch YouTube comments first.'); return; }

  const wrap = document.getElementById('yt-wordcloud-wrap')!;
  const canvas = document.getElementById('yt-wordcloud-canvas') as HTMLCanvasElement;
  const wordLimit = ytGetWordCount();
  const fontScale = ytGetFontScale();
  const words = ytBuildWordFreq(wordLimit);

  wrap.classList.remove('hidden');
  _wcUpdateSliderFill(document.getElementById('yt-wc-words') as HTMLInputElement);
  _wcUpdateSliderFill(document.getElementById('yt-wc-font') as HTMLInputElement);
  wrap.scrollIntoView({ behavior: 'smooth' });

  const W = 1200, H = 650, DPR = window.devicePixelRatio || 2;
  canvas.width = W * DPR; canvas.height = H * DPR;
  canvas.style.width = '100%'; canvas.style.background = '#ffffff';

  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(DPR, DPR);

  const d3 = (window as any).d3;
  const maxF = words[0].value, minF = words[words.length - 1].value;
  const sizeScale  = d3.scaleSqrt().domain([minF, maxF]).range([14 * fontScale, 72 * fontScale]);
  const colorScale = d3.scaleLinear().domain([minF, maxF]).range([0, 1]);

  function pickColor(v: number, text: string): string {
    const t = colorScale(v);
    const pal = ['#0f172a','#1e293b','#334155','#1d4ed8','#2563eb','#3b82f6','#7c3aed','#8b5cf6','#0f766e','#14b8a6','#15803d','#22c55e'];
    let pool = t > 0.8 ? pal.slice(0,3) : t > 0.6 ? pal.slice(2,6) : t > 0.4 ? pal.slice(4,9) : pal.slice(6);
    if (text.includes(' ') && t > 0.4) pool = ['#7c3aed','#8b5cf6','#14b8a6'];
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function pickWeight(v: number): number { const t = colorScale(v); return t > 0.8 ? 800 : t > 0.5 ? 700 : 600; }

  d3.layout.cloud().size([W, H]).canvas(() => document.createElement('canvas'))
    .words(words.map(w => ({ ...w, size: Math.round(sizeScale(w.value)), rotate: Math.random() < 0.1 ? (Math.random() < 0.5 ? -20 : 20) : 0 })))
    .padding(2).rotate((d: any) => d.rotate).font('Inter').fontSize((d: any) => d.size)
    .on('end', (dw: any[]) => {
      ctx.clearRect(0,0,W,H); ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,W,H); ctx.translate(W/2,H/2);
      dw.forEach(w => {
        ctx.save(); ctx.translate(w.x,w.y); ctx.rotate(w.rotate*Math.PI/180);
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillStyle=pickColor(w.value,w.text);
        ctx.font=`${pickWeight(w.value)} ${w.size}px Inter`;
        ctx.fillText(w.text,0,0); ctx.restore();
      });
      ctx.setTransform(1,0,0,1,0,0);
    }).start();
}

export function ytDownloadWordCloud(): void {
  const canvas = document.getElementById('yt-wordcloud-canvas') as HTMLCanvasElement;
  const link = document.createElement('a');
  link.download = `yt_wordcloud_${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

export function ytCopyWordCloud(): void {
  const canvas = document.getElementById('yt-wordcloud-canvas') as HTMLCanvasElement;
  canvas.toBlob(blob => { if (!blob) return; navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); });
  showError('Copied!');
}

function _wcUpdateSliderFill(el: HTMLInputElement | null): void {
  if (!el) return;
  const min = Number(el.min || 0), max = Number(el.max || 100), val = Number(el.value);
  const pct = ((val - min) / (max - min) * 100).toFixed(1);
  el.style.background = `linear-gradient(to right, rgba(16,185,129,0.85) 0%, rgba(16,185,129,0.85) ${pct}%, rgba(255,255,255,0.12) ${pct}%, rgba(255,255,255,0.12) 100%)`;
}

export function _ytWcLiveUpdate(): void {
  if (!ytCommentsData.length) return;
  ytGetWordCount(); ytGetFontScale();
  _wcUpdateSliderFill(document.getElementById('yt-wc-words') as HTMLInputElement);
  _wcUpdateSliderFill(document.getElementById('yt-wc-font') as HTMLInputElement);
  if (_ytWcDebounce) clearTimeout(_ytWcDebounce);
  _ytWcDebounce = setTimeout(() => ytGenerateWordCloud(), 280);
}
