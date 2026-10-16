'use strict';

const app = document.querySelector('#app');
const KEY = 'studyfire.v1';
const fresh = () => ({learned: {}, weak: {}, weakTables: {}, stats: {right: 0, total: 0}, resume: {}});
let state;
try { state = Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY) || '{}')); }
catch { state = fresh(); }
let cards = [], filter = 'all', session = null, offlineStatus = '오프라인 자료 저장 중…';
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const save = () => {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { offlineStatus = '기록을 저장할 수 없어요. 브라우저 저장 공간을 확인해 주세요.'; }
};
const chapterKey = c => `${c.part}|${c.chapter}`;
const chapterName = c => `P${c.part.match(/\d+/)?.[0] || ''} ${c.chapter}`;
const shuffle = values => {
  const a = [...values];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const scope = (chapter = null) => cards.filter(c =>
  (filter === 'all' || (filter === 'star' ? c.star : c.review)) &&
  (!chapter || chapterKey(c) === chapter));

// Protect math before Markdown can consume underscores, backslashes or table syntax.
function render(source) {
  const math = [];
  let text = String(source).replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, (_, display, inline) => {
    const token = `MATHPLACEHOLDER${math.length}END`;
    math.push(katex.renderToString((display ?? inline).trim(), {displayMode: display !== undefined, throwOnError: false, strict: false, output: 'html'}));
    return token;
  }).replace(/==(.+?)==/g, '<mark>$1</mark>');
  const lines = text.split('\n'), chunks = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\|/.test(line)) {
      const table = [line.trim()];
      while (i + 1 < lines.length && /^\s*\|/.test(lines[i + 1])) table.push(lines[++i].trim());
      chunks.push(`<div class="table-wrap">${marked.parse(table.join('\n'), {gfm: true, breaks: true})}</div>`);
    } else if (line.trim()) {
      const indent = (line.match(/^ */)[0].length) / 2;
      // Each source line is a paragraph: indentation is layout, never a code fence.
      const content = line.trim().replace(/^```.*$/, '')
        .replace(/^(\d+)([.)])(?=\s|$)/, '$1\\$2');
      chunks.push(`<div class="line" style="--indent:${indent}">${marked.parse(content, {gfm: true, breaks: true})}</div>`);
    }
  }
  const node = document.createElement('div');
  node.innerHTML = chunks.join('').replace(/MATHPLACEHOLDER(\d+)END/g, (_, n) => math[Number(n)]);
  // Source content is local, but do not permit executable HTML or remote assets.
  node.querySelectorAll('script,iframe,object,embed,style,link,pre,code').forEach(el => el.replaceWith(document.createTextNode(el.textContent)));
  node.querySelectorAll('*').forEach(el => {
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
    }
    if (el.hasAttribute('href')) el.removeAttribute('href');
    if (el.tagName === 'IMG' && !/^images-gpt\/[\w.-]+\.(png|svg)$/.test(el.getAttribute('src') || '')) el.remove();
  });
  return node.innerHTML;
}

function tags(c) {
  return `<span class="tag ch-tag">${esc(chapterName(c))}</span>${c.star ? '<span class="tag star">★ 중요</span>' : ''}${c.review ? '<span class="tag rv">검수 필요</span>' : ''}`;
}
const bodyHTML = c => `<div class="markdown">${render(c.body)}</div>`;
const titleHTML = c => `<div class="markdown">${render(c.title)}</div>`;
const button = (label, action, cls = '', extra = '') => `<button class="btn ${cls}" data-action="${action}" ${extra}>${label}</button>`;
function mount(html) {
  app.innerHTML = html;
  window.scrollTo(0, 0);
}
function home() {
  session = null;
  const selected = scope(), learned = selected.filter(c => state.learned[c.id]).length;
  const weak = selected.filter(c => c.id in state.weak).length;
  const done = selected.length > 0 && learned === selected.length;
  const accuracy = state.stats.total ? `${Math.round(state.stats.right / state.stats.total * 100)}%` : '—';
  const chapters = [...new Set(selected.map(chapterKey))];
  mount(`<section class="home"><h1>소방 공식 암기</h1>
    <p class="sub">소방설비기사 기계 실기 · 카드 ${cards.length}장</p>
    <div class="steps">
      <button class="step ${!done ? 'primary' : ''}" data-action="flash"><span class="n">①</span><span class="t"><b>처음 학습${Object.keys(state.resume).length ? ' 이어하기' : ''}</b><span>카드 뒤집기 · 전체 한 번 보기</span></span><span class="v">${learned} / ${selected.length}</span></button>
      <button class="step" data-action="quiz"><span class="n">②</span><span class="t"><b>약점 찾기</b><span>객관식 · 20문제씩</span></span><span class="v">정답률<br>${accuracy}</span></button>
      <button class="step ${done ? 'primary' : ''}" data-action="focus"><span class="n">③</span><span class="t"><b>집중 학습</b><span>약점 카드만 객관식 + 표 암기</span></span><span class="v">약점<br>${weak}장</span></button>
    </div><p class="sec">장별 진도</p><div class="chips" role="group" aria-label="카드 범위">
      ${[['all','전체'],['star','★ 중요'],['review','검수 필요']].map(([key,label]) => `<button class="chip" data-filter="${key}" aria-pressed="${filter === key}">${label}</button>`).join('')}
    </div>
    ${chapters.map((key, i) => {
      const group = selected.filter(c => chapterKey(c) === key);
      const n = group.filter(c => state.learned[c.id]).length, w = group.filter(c => c.id in state.weak).length;
      return `<button class="ch" data-chapter="${i}"><span>${esc(chapterName(group[0]))}</span><span class="w ${w ? '' : 'none'}">약점 ${w}</span><small aria-label="학습 ${n}/${group.length}"><i style="width:${n / group.length * 100}%"></i></small></button>`;
    }).join('')}
    ${selected.length ? '' : '<p class="note">이 범위에 카드가 없어요.</p>'}
    <p class="note" id="offline-status" role="status">${esc(offlineStatus)}</p>
    <button class="reset" data-action="reset">기록 초기화</button>
    </section>`);
  app.querySelectorAll('[data-chapter]').forEach(el => el.onclick = () => chooser(chapters[Number(el.dataset.chapter)]));
}
function chooser(chapter = null, focus = false) {
  const dialog = document.createElement('dialog');
  dialog.innerHTML = `<h2>${focus ? '집중 학습' : esc(chapterName(scope(chapter)[0]))}</h2><p class="note">${focus ? '두 번 연속 정답이면 카드 약점에서 빠져요. 틀렸던 표도 함께 복습해요.' : '이 장에서 학습할 방법을 골라 주세요.'}</p><div class="chooser">
    ${focus ? '' : button('카드 뒤집기','choose-flash')}
    ${button('객관식','choose-quiz','good')}${button('표 암기','choose-table')}
    ${button('닫기','close')}</div>`;
  app.append(dialog);
  dialog.addEventListener('click', e => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    dialog.close(); dialog.remove();
    if (action === 'choose-flash') startFlash(chapter);
    if (action === 'choose-quiz') startQuiz(chapter, focus);
    if (action === 'choose-table') startTables(chapter, focus);
  });
  dialog.addEventListener('cancel', () => dialog.remove());
  dialog.showModal();
}
function frame(label, pos, total, content, actions = '') {
  mount(`<div class="bar"><button class="back" data-action="home" aria-label="뒤로">‹</button><span>${esc(label)}</span><span class="count">${pos} / ${total}</span></div><div class="progress"><i style="width:${total ? pos / total * 100 : 0}%"></i></div><section class="scroll">${content}</section>${actions ? `<div class="actions">${actions}</div>` : ''}`);
}
function empty(message) {
  mount(`<section class="empty"><h2>${esc(message)}</h2>${button('홈으로','home','good')}</section>`);
}
function startFlash(chapter = null) {
  const pool = scope(chapter);
  if (!pool.length) return empty('이 범위에 카드가 없어요.');
  const key = `${filter}|${chapter || 'all'}`;
  const start = (state.resume[key] || 0) % pool.length;
  session = {mode:'flash', pool, index:start, visited:0, revealed:false, key, chapter};
  flash();
}
function flash() {
  const s = session, c = s.pool[s.index];
  frame(`카드 뒤집기 · ${chapterName(c)}`, s.index + 1, s.pool.length,
    `<article class="card" ${s.revealed ? '' : 'role="button" tabindex="0" aria-label="카드 뒤집기" data-action="reveal"'}>${tags(c)}<div class="q">${titleHTML(c)}</div>${s.revealed ? `<div class="ans">${bodyHTML(c)}</div>` : '<p class="note">카드를 누르면 정답이 열려요.</p>'}</article>`,
    s.revealed ? button('몰랐음','unknown','bad') + button('알았음','known','good') : button('정답 보기','reveal','wide good'));
}
function flashAnswer(known) {
  const s = session, c = s.pool[s.index];
  if (known) state.learned[c.id] = true;
  else state.weak[c.id] = {streak:0};
  s.index = (s.index + 1) % s.pool.length;
  state.resume[s.key] = s.index;
  save();
  s.visited++;
  if (s.visited === s.pool.length) return empty('이번 카드 학습을 마쳤어요.');
  s.revealed = false;
  flash();
}

const numericPattern = /-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g;
const numberValue = text => parseFloat(String(text).replace(/,/g, ''));
function numberLines(c) {
  return (c.body || c.title).replace(/\$\$[\s\S]*?\$\$/g, '').split('\n').map(l => l.trim().replace(/^\d+[.)]\s*/, ''))
    .filter(l => l && !/^(?:\||!\[)|\$\$/.test(l))
    .map(l => {
      // Do not change formula subscripts/exponents or list numbering into answers.
      const withoutMath = l.replace(/\$[^$]*\$/g, m => ' '.repeat(m.length));
      return {line:l, matches:/\\[a-zA-Z]+|\$/.test(withoutMath) ? [] : [...withoutMath.matchAll(numericPattern)]};
    }).filter(l => l.matches.length);
}
function preferredOthers(c) {
  const others = cards.filter(x => x.id !== c.id);
  return [...shuffle(others.filter(x => chapterKey(x) === chapterKey(c))), ...shuffle(others.filter(x => chapterKey(x) !== chapterKey(c)))];
}
function makeQuestion(c, forcedType = null) {
  const types = [];
  if (c.formulas.length) {
    const first = c.formulas[0], options = [first], seen = new Set([first.replace(/\s/g,'')]);
    for (const other of preferredOthers(c)) for (const formula of other.formulas) {
      const key = formula.replace(/\s/g,'');
      if (!seen.has(key) && options.length < 4) { seen.add(key); options.push(formula); }
    }
    if (options.length === 4) types.push({type:'formula', prompt:`${c.title}의 공식은?`, options, correct:first});
  }
  const lines = numberLines(c);
  if (lines.length) {
    const item = shuffle(lines)[0], match = shuffle(item.matches)[0], original = numberValue(match[0]);
    const options = [item.line];
    const chapterNumbers = cards.filter(x => chapterKey(x) === chapterKey(c)).flatMap(x => numberLines(x).flatMap(l => l.matches.map(m => numberValue(m[0]))));
    const replacements = [...shuffle([...new Set(chapterNumbers)]), original * 2, original / 2, original + 1, original + 2, original + 3];
    for (const value of replacements) {
      if (value === original || !Number.isFinite(value)) continue;
      const line = item.line.slice(0, match.index) + String(value) + item.line.slice(match.index + match[0].length);
      if (!options.includes(line)) options.push(line);
      if (options.length === 4) break;
    }
    const prompt = c.body ? `${c.title} — 맞는 내용은?` : `${item.line.slice(0,match.index)}□${item.line.slice(match.index + match[0].length)} — 빈칸에 맞는 내용은?`;
    if (options.length === 4) types.push({type:'number', prompt, options, correct:item.line});
  }
  const options = [c.title];
  for (const other of preferredOthers(c)) {
    if (!options.includes(other.title)) options.push(other.title);
    if (options.length === 4) break;
  }
  const excerpt = c.body.replace(/\$\$[\s\S]*?\$\$/g, '').split('\n').filter(l => l.trim() && !/^\s*!\[|^\s*\|[\s:|-]+\|\s*$/.test(l)).slice(0, 3).join('\n');
  if (!types.length && options.length === 4 && excerpt) types.push({type:'reverse', prompt:'다음 내용에 해당하는 제목은?', excerpt, options, correct:c.title});
  const valid = forcedType ? types.filter(t => t.type === forcedType) : types;
  if (!valid.length) return null;
  const q = shuffle(valid)[0];
  q.options = shuffle(q.options);
  q.card = c;
  return q;
}
function startQuiz(chapter = null, focus = false, retry = null) {
  const pool = retry || scope(chapter).filter(c => !focus || c.id in state.weak);
  const questions = shuffle(pool).slice(0,20).map(c => makeQuestion(c)).filter(Boolean);
  if (!questions.length) return empty(focus ? '복습할 약점 카드가 없어요.' : '출제할 카드가 없어요.');
  session = {mode:'quiz', questions, index:0, right:0, wrong:[], answered:false, chapter, focus};
  quiz();
}
function quiz() {
  const s = session, q = s.questions[s.index], c = q.card;
  frame(`${s.focus ? '집중 학습' : '객관식'} · ${s.chapter ? chapterName(c) : '전체'}`, s.index+1, s.questions.length,
    `${tags(c)}<div class="qtext markdown">${render(q.prompt)}</div>${q.excerpt ? `<div class="explain markdown">${render(q.excerpt)}</div>` : ''}
    <div class="opts">${q.options.map((option,i) => {
      const right = s.answered && option === q.correct, wrong = s.answered && i === s.choice && !right;
      return `<button class="opt ${right ? 'right' : wrong ? 'wrong' : ''}" data-option="${i}" ${s.answered ? 'disabled' : ''}><span class="k">${i+1}</span><span class="content markdown">${q.type === 'formula' ? render(`$$${option}$$`) : render(option)}</span>${right ? '<span class="r">정답</span>' : wrong ? '<span class="r">내 답 · 오답</span>' : ''}</button>`;
    }).join('')}</div>${s.answered ? `<p role="status" class="note">${q.options[s.choice] === q.correct ? '정답이에요.' : '오답이에요. 약점에 저장했어요.'}</p><details class="explain"><summary>카드 보기</summary>${titleHTML(c)}${bodyHTML(c)}</details>` : ''}`,
    s.answered ? button(s.index + 1 === s.questions.length ? '결과 보기' : '다음 문제','next-quiz','wide good') : '');
}
function answerQuiz(choice) {
  const s = session;
  if (s.answered) return;
  const q = s.questions[s.index], id = q.card.id, right = q.options[choice] === q.correct;
  s.answered = true; s.choice = choice;
  state.stats.total++;
  if (right) {
    state.stats.right++; s.right++;
    if (s.focus && id in state.weak) {
      state.weak[id].streak++;
      if (state.weak[id].streak >= 2) delete state.weak[id];
    }
  } else { state.weak[id] = {streak:0}; s.wrong.push(q.card); }
  save(); quiz();
}
function quizEnd() {
  const s = session;
  frame('학습 결과', s.questions.length, s.questions.length,
    `<div class="empty"><h1>${s.right} / ${s.questions.length} 정답</h1><p class="sub">정답률 ${Math.round(s.right / s.questions.length * 100)}% · 틀린 카드 ${s.wrong.length}장</p></div>`,
    button('홈으로','home') + (s.wrong.length ? button('틀린 카드 다시 풀기','retry','good') : button('한 번 더','again','good')));
}

function flattenMath(value) {
  return String(value).replace(/<br\s*\/?>/gi, '\n').replace(/\$\$?([^$]+)\$\$?/g, (_, m) => {
    let text = m.replace(/\\(?:text|mathrm|mathbf)\{([^{}]*)\}/g, '$1')
      .replace(/\\xrightarrow\{[^{}]*\}/g, '→')
      .replace(/\^\{?2\}?/g, '²').replace(/\^\{?3\}?/g, '³')
      .replace(/\\times/g, '×').replace(/\\ /g, ' ');
    while (/\\(?:d?frac)\{([^{}]*)\}\{([^{}]*)\}/.test(text)) text = text.replace(/\\(?:d?frac)\{([^{}]*)\}\{([^{}]*)\}/g, '$1/$2');
    return text.replace(/[\\{}]/g, '');
  });
}
function tableItems(pool) {
  return pool.flatMap(c => c.tables.map((table, i) => {
    const rows = table.rows.map(row => row.map(flattenMath));
    const count = rows.reduce((sum,row) => sum + row.slice(1).reduce((n,cell) => n + [...cell.matchAll(numericPattern)].length,0),0);
    return {id:`${c.id}:${i}`, card:c, table, rows, count};
  })).filter(t => t.count > 0);
}
function startTables(chapter = null, focus = false) {
  const items = tableItems(scope(chapter)).filter(t => !focus || t.card.id in state.weak || t.id in state.weakTables);
  if (!items.length) return empty('이 범위에 숫자를 채울 표가 없어요.');
  session = {mode:'table', items, index:0, graded:false, answers:[], rightTables:0};
  tableScreen();
}
function tableScreen() {
  const s = session, item = s.items[s.index];
  let blank = 0;
  const rows = item.rows.map((row,ri) => `<tr>${row.map((cell,ci) => {
    if (ci === 0) return `<td class="markdown">${render(item.table.rows[ri][ci])}</td>`;
    let html = '', last = 0;
    for (const match of cell.matchAll(numericPattern)) {
      html += esc(cell.slice(last,match.index)).replace(/\n/g,'<br>');
      const i = blank++, expected = numberValue(match[0]);
      if (!s.graded) {
        html += `<input class="num-in" inputmode="decimal" type="text" autocomplete="off" aria-label="${esc(flattenMath(row[0]))} ${esc(flattenMath(item.table.header[ci] || '값'))} 빈칸 ${i+1}" data-blank="${i}" data-expected="${expected}">`;
      } else {
        const value = s.answers[i], ok = numberValue(value) === expected;
        html += ok ? `<span class="num ok">${esc(value)} ✓</span>` : `<span class="num no"><s>${esc(value || '미입력')}</s></span><span class="num answer">${esc(match[0])}</span>`;
      }
      last = match.index + match[0].length;
    }
    html += esc(cell.slice(last)).replace(/\n/g,'<br>');
    return `<td>${html}</td>`;
  }).join('')}</tr>`).join('');
  frame('표 암기 · ' + chapterName(item.card), s.index + 1, s.items.length,
    `${tags(item.card)}<div class="qtext">${titleHTML(item.card)}</div><p class="note">첫 열은 힌트예요. 나머지 숫자 ${item.count}개를 채워 주세요. 단위는 입력하지 않아요.</p>
    <div class="table-wrap"><table><thead><tr>${item.table.header.map(h => `<th class="markdown" scope="col">${render(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
    ${s.graded ? `<p class="note" role="status">${s.tableRight ? '모두 정답이에요. 표 약점에서 제외했어요.' : '틀린 값이 있어요. 표 약점에 저장했어요. 초록색 정답을 확인해 주세요.'}</p>` : ''}`,
    button(s.graded ? (s.index + 1 === s.items.length ? '결과 보기' : '다음 표') : '채점하기', s.graded ? 'next-table' : 'grade', 'wide good'));
}
function gradeTable() {
  const s = session;
  if (s.graded) return;
  const inputs = [...app.querySelectorAll('[data-blank]')];
  s.answers = inputs.map(input => input.value.trim());
  s.tableRight = inputs.every(input => numberValue(input.value) === Number(input.dataset.expected));
  const id = s.items[s.index].id;
  if (s.tableRight) { delete state.weakTables[id]; s.rightTables++; }
  else state.weakTables[id] = true;
  s.graded = true; save(); tableScreen();
}
app.addEventListener('click', e => {
  const el = e.target.closest('button,[data-action]');
  if (!el || el.closest('dialog')) return;
  if (el.dataset.filter) { filter = el.dataset.filter; home(); return; }
  if (el.dataset.option !== undefined) { answerQuiz(Number(el.dataset.option)); return; }
  switch (el.dataset.action) {
    case 'home': home(); break;
    case 'flash': startFlash(); break;
    case 'quiz': startQuiz(); break;
    case 'focus': chooser(null,true); break;
    case 'reveal': if (session?.mode === 'flash') { session.revealed = true; flash(); } break;
    case 'known': flashAnswer(true); break;
    case 'unknown': flashAnswer(false); break;
    case 'next-quiz': if (++session.index === session.questions.length) quizEnd(); else { session.answered = false; quiz(); } break;
    case 'retry': startQuiz(session.chapter, session.focus, session.wrong); break;
    case 'again': startQuiz(session.chapter, session.focus); break;
    case 'grade': gradeTable(); break;
    case 'next-table':
      if (++session.index === session.items.length) empty(`표 학습 완료 · ${session.rightTables} / ${session.items.length} 정답`);
      else { session.graded = false; session.answers = []; tableScreen(); }
      break;
    case 'reset':
      if (confirm('학습 기록을 모두 지울까요? 이 작업은 되돌릴 수 없어요.')) { state = fresh(); save(); home(); }
      break;
  }
});
app.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"][data-action="reveal"]')) {
    e.preventDefault(); session.revealed = true; flash();
  }
});
async function init() {
  try {
    const response = await fetch('data/cards.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    cards = await response.json();
    home();
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('sw.js');
        await navigator.serviceWorker.ready;
        offlineStatus = '오프라인 학습 준비 완료 · 기록은 이 기기에 저장돼요.';
      } catch { offlineStatus = '오프라인 저장 실패 · 연결된 상태에서는 학습할 수 있어요.'; }
    } else offlineStatus = '이 브라우저는 오프라인 저장을 지원하지 않아요.';
    const status = document.querySelector('#offline-status');
    if (status) status.textContent = offlineStatus;
  } catch (error) {
    empty('카드를 불러올 수 없어요. 웹 서버에서 /v1/을 열어 주세요.');
  }
}
init();
