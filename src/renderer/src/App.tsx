import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Routes,
  Route,
  NavLink,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  AudioLines,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  History,
  Home as HomeIcon,
  Lightbulb,
  Mic,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Settings2,
  Shuffle,
  Sparkles,
  Square,
  Trash2,
  X,
  Pin,
  Volume2,
} from "lucide-react";
import type {
  Topic,
  Detail,
  Settings,
  Attempt,
  Feedback,
  Api,
} from "../../shared/types";
import { useTraining, time } from "./state";
import { Recorder } from "./recorder";
import s from "./App.module.css";
let sound: AudioContext | null = null;
function unlockSound() {
  sound ||= new AudioContext();
  void sound.resume();
}
function ding() {
  if (!sound) return;
  const o = sound.createOscillator();
  const g = sound.createGain();
  o.connect(g);
  g.connect(sound.destination);
  o.frequency.value = 660;
  g.gain.setValueAtTime(0.14, sound.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, sound.currentTime + 0.8);
  o.start();
  o.stop(sound.currentTime + 0.8);
}
function Button({
  children,
  onClick,
  secondary = false,
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={secondary ? s.secondary : s.primary}
    >
      {children}
    </button>
  );
}
function Badge({ children }: { children: ReactNode }) {
  return <span className={s.badge}>{children}</span>;
}
const phaseNames = {
  research: "查资料",
  organize: "整理知识",
  ready: "准备演讲",
};
function errorMessage(e: unknown) {
  return e instanceof Error
    ? e.message.replace(/^Error invoking remote method '[^']+': Error: /, "")
    : "操作失败，请重试。";
}
export function App() {
  const { snapshot, update } = useTraining();
  const floating = location.hash.startsWith("#/floating");
  const previous = useRef<string | null>(null);
  useEffect(() => {
    void window.api.snapshot().then(update);
    return window.api.subscribe((value) => {
      update(value);
      if (
        !floating &&
        previous.current &&
        previous.current !== value.session?.phase
      )
        ding();
      previous.current = value.session?.phase || null;
    });
  }, []);
  if (floating) return <Floating />;
  return (
    <div className={s.shell}>
      <aside className={s.sidebar}>
        <div className={s.brand}>
          <div className={s.brandIcon}>
            <AudioLines size={23} />
          </div>
          <div>
            言之有物<small>随机演讲训练器</small>
          </div>
        </div>
        <div className={s.navLabel}>你的表达练习室</div>
        <nav>
          <NavLink to="/" end>
            <HomeIcon size={19} />
            开始练习
          </NavLink>
          <NavLink to="/history">
            <History size={19} />
            训练记录
          </NavLink>
          {snapshot.session && (
            <NavLink to="/training">
              <Mic size={19} />
              当前训练
              <span className={s.liveDot} />
            </NavLink>
          )}
        </nav>
        <div className={s.sidebarBottom}>
          <div className={s.note}>
            <Lightbulb size={19} />
            <p>
              真正理解一个知识，
              <br />
              从把它讲清楚开始。
            </p>
            <small>THE FEYNMAN TECHNIQUE</small>
          </div>
          <NavLink to="/settings">
            <Settings2 size={18} />
            服务与设置
          </NavLink>
          <span className={s.local}>
            <span />
            内容保存在本机
          </span>
        </div>
      </aside>
      <main className={s.main}>
        <header className={s.topbar}>
          <span>少一点输入，多一点理解。</span>
          <span>
            <span className={s.greenDot} />
            个人学习空间
          </span>
        </header>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/training" element={<Training />} />
          <Route path="/result/:id" element={<Result />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
function Home() {
  const nav = useNavigate();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [index, setIndex] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [category, setCategory] = useState("全部主题");
  const [error, setError] = useState("");
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void window.api.topics().then((t) => {
      setTopics(t);
      setIndex(Math.floor(Math.random() * t.length));
    });
    void window.api
      .history()
      .then((h) => setCount(h.filter((x) => x.completed).length));
  }, []);
  const filtered = topics.filter(
    (t) => category === "全部主题" || t.category === category,
  );
  const topic = filtered[index % (filtered.length || 1)];
  useEffect(() => {
    if (!rolling) return;
    const timer = setInterval(
      () =>
        setIndex(
          (i) =>
            i +
            1 +
            Math.floor(Math.random() * Math.max(1, filtered.length - 1)),
        ),
      90,
    );
    return () => clearInterval(timer);
  }, [rolling]);
  async function start() {
    if (!topic || busy) return;
    setBusy(true);
    try {
      unlockSound();
      await window.api.start(topic.id);
      nav("/training");
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <div className={s.page}>
      <div className={s.eyebrow}>每天 17 分钟 · 让知识成为自己的</div>
      <h1>
        今天，把一个新知识<span>讲清楚。</span>
      </h1>
      <p className={s.lead}>
        随机一个主题，留一点时间学习，再用自己的话讲出来。
      </p>
      <div className={s.homeGrid}>
        <section className={s.topicCard}>
          <div className={s.cardTop}>
            <span>
              <Shuffle size={18} />
              今天的探索主题
            </span>
            <select
              aria-label="主题分类"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setIndex(0);
              }}
            >
              {["全部主题", ...new Set(topics.map((t) => t.category))].map(
                (c) => (
                  <option key={c}>{c}</option>
                ),
              )}
            </select>
          </div>
          <div className={s.topicBody}>
            <div className={s.orbit}>
              <Sparkles size={30} />
              <i />
              <b />
            </div>
            <Badge>{topic?.category || "加载题库"}</Badge>
            <h2>{topic?.title || "正在准备今天的主题…"}</h2>
            <p>{topic?.prompt}</p>
            <div className={s.keywords}>
              {topic?.keywords.map((k) => (
                <span key={k}>{k}</span>
              ))}
            </div>
          </div>
          <div className={s.topicActions}>
            <Button
              secondary
              disabled={busy}
              onClick={() => setRolling((v) => !v)}
            >
              <RefreshCw size={17} className={rolling ? s.spin : ""} />
              {rolling ? "停在这里" : "换一个主题"}
            </Button>
            <Button
              disabled={busy || !topic}
              onClick={() => {
                setRolling(false);
                void start();
              }}
            >
              锁定主题，开始练习
              <ArrowRight size={17} />
            </Button>
          </div>
          <div className={s.cardFoot}>
            <Clock3 size={14} />
            无需准备，从好奇心开始就好
          </div>
        </section>
        <aside className={s.howCard}>
          <Badge>HOW IT WORKS</Badge>
          <h2>
            一次小练习，
            <br />
            一个完整的理解。
          </h2>
          <div className={s.steps}>
            {[
              {
                n: "01",
                title: "探索与学习",
                desc: "自己查资料，抓住核心概念",
                time: "10 分钟",
                icon: <BookOpen size={19} />,
              },
              {
                n: "02",
                title: "整理思路",
                desc: "写下提纲，找到自己的例子",
                time: "5 分钟",
                icon: <Lightbulb size={19} />,
              },
              {
                n: "03",
                title: "讲给新手听",
                desc: "录下表达，让 AI 帮你复盘",
                time: "2 分钟",
                icon: <Mic size={19} />,
              },
            ].map((v) => (
              <div className={s.step} key={v.n}>
                <div className={s.stepIcon}>{v.icon}</div>
                <div>
                  <h3>
                    {v.title}
                    <small>{v.time}</small>
                  </h3>
                  <p>{v.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className={s.howTip}>
            <Sparkles size={17} />
            <span>
              不必讲得完美。
              <br />
              发现讲不清的地方，就是进步的起点。
            </span>
          </div>
        </aside>
      </div>
      <div className={s.bottomCards}>
        <div>
          <span className={s.softIcon}>
            <Check size={21} />
          </span>
          <div>
            <strong>{count} 次完整练习</strong>
            <p>每一次开口，都在积累。</p>
          </div>
          <button aria-label="查看历史" onClick={() => nav("/history")}>
            <ArrowUpRight size={20} />
          </button>
        </div>
        <div>
          <span className={s.softIcon}>
            <Pin size={21} />
          </span>
          <div>
            <strong>切换窗口，也不会忘记时间</strong>
            <p>独立悬浮计时器，陪你安心查资料。</p>
          </div>
        </div>
      </div>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      <p className={s.footerQuote}>
        “如果你不能简单地解释它，你就还没有充分理解它。”
        <span>把复杂留给思考，把简单留给表达。</span>
      </p>
    </div>
  );
}
function Training() {
  const { snapshot } = useTraining();
  const session = snapshot.session;
  const nav = useNavigate();
  const [outline, setOutline] = useState(session?.outline || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [level, setLevel] = useState(0);
  const [draft, setDraft] = useState<Attempt | null>(null);
  const [decoded, setDecoded] = useState(false);
  const recorder = useRef<Recorder | null>(null);
  const saving = useRef(Promise.resolve());
  const textRef = useRef(outline);
  const refresh = () => {
    if (session)
      void window.api
        .detail(session.id)
        .then((d) =>
          setDraft(d.attempts.filter((a) => !a.submitted).at(-1) || null),
        );
  };
  useEffect(() => {
    setOutline(session?.outline || "");
    textRef.current = session?.outline || "";
    refresh();
  }, [session?.id]);
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(() => {
      saving.current = saving.current
        .catch(() => {})
        .then(() => window.api.outline(session.id, outline))
        .catch((e) => setError(errorMessage(e)));
    }, 350);
    return () => clearTimeout(timer);
  }, [outline, session?.id]);
  useEffect(() => {
    if (
      snapshot.recordingId &&
      (snapshot.recordingRemainingMs <= 0 || snapshot.notice === "录音需要结束")
    )
      recorder.current?.stop(
        snapshot.notice === "录音需要结束" && snapshot.recordingRemainingMs > 0,
      );
  }, [snapshot.recordingRemainingMs, snapshot.notice]);
  useEffect(
    () => () => {
      if (recorder.current?.media?.state === "recording")
        recorder.current.stop(true);
      if (session) void window.api.outline(session.id, textRef.current);
    },
    [session?.id],
  );
  if (!session)
    return (
      <div className={s.page}>
        <h1>从一个好问题开始</h1>
        <Button onClick={() => nav("/")}>
          去抽取主题
          <ArrowRight size={16} />
        </Button>
      </div>
    );
  async function action(fn: () => Promise<unknown>) {
    setError("");
    setBusy(true);
    try {
      await saving.current;
      await window.api.outline(session!.id, textRef.current);
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function record() {
    await action(async () => {
      recorder.current = new Recorder(
        (a) => {
          setDraft(a);
          setDecoded(false);
          setBusy(false);
        },
        setError,
        setLevel,
      );
      await recorder.current.start();
      setDraft(null);
    });
  }
  const active = snapshot.recordingId !== null;
  return (
    <div className={s.page}>
      <div className={s.breadcrumb}>
        今日练习
        <ChevronRight size={14} />
        {session.topic.category}
      </div>
      <div className={s.headingRow}>
        <div>
          <h1 className={s.smaller}>{session.topic.title}</h1>
          <p className={s.lead}>{session.topic.prompt}</p>
        </div>
        <Button secondary onClick={() => void window.api.floating(true)}>
          <Pin size={17} />
          悬浮计时
        </Button>
      </div>
      <div className={s.phaseTabs}>
        {["research", "organize", "ready"].map((p, i) => (
          <div className={session.phase === p ? s.phaseActive : ""} key={p}>
            <span>{i + 1}</span>
            {phaseNames[p as keyof typeof phaseNames]}
            <small>{["10 分钟", "5 分钟", "2 分钟"][i]}</small>
          </div>
        ))}
      </div>
      {snapshot.notice && <div className={s.notice}>{snapshot.notice}</div>}
      <div className={s.trainGrid}>
        <section className={s.panel}>
          <div className={s.sectionTitle}>
            <BookOpen size={19} />
            <h2>我的知识提纲</h2>
            <small>自动保存到本机</small>
          </div>
          <p className={s.muted}>
            试着回答：它是什么？为什么重要？能举什么例子？
          </p>
          <textarea
            aria-label="知识提纲"
            className={s.outline}
            maxLength={20000}
            value={outline}
            onChange={(e) => {
              setOutline(e.target.value);
              textRef.current = e.target.value;
            }}
            placeholder={
              "一句话解释这个概念…\n\n它的核心原理是…\n\n一个生活中的例子…\n\n还没弄明白的问题…"
            }
          />
          <div className={s.keywords}>
            {session.topic.keywords.map((k) => (
              <span key={k}>{k}</span>
            ))}
          </div>
        </section>
        <section className={s.timerCard}>
          <span className={s.eyebrow}>
            {active
              ? "正在录音"
              : draft
                ? "录音已保存"
                : phaseNames[session.phase]}
          </span>
          <div className={s.timer}>
            {time(active ? snapshot.recordingRemainingMs : session.remainingMs)}
          </div>
          <p>
            {active
              ? "像向一位新朋友解释一样，自然地讲。"
              : session.phase === "ready"
                ? "准备好后点击录音，不会自动收音。"
                : session.paused
                  ? "计时已暂停，按自己的节奏继续。"
                  : "让注意力留在理解上，时间交给我们。"}
          </p>
          {session.phase !== "ready" ? (
            <>
              <Button
                onClick={() =>
                  void action(() =>
                    session.paused
                      ? window.api.resume(snapshot.version)
                      : window.api.pause(snapshot.version),
                  )
                }
                disabled={busy}
              >
                {session.paused ? <Play size={17} /> : <Pause size={17} />}{" "}
                {session.paused ? "继续计时" : "暂停一下"}
              </Button>
              <button
                className={s.textButton}
                disabled={busy}
                onClick={() =>
                  void action(() => window.api.next(snapshot.version))
                }
              >
                我准备好了，进入下一步
                <ArrowRight size={16} />
              </button>
            </>
          ) : active ? (
            <>
              <div className={s.wave}>
                {Array.from({ length: 20 }, (_, i) => (
                  <i
                    key={i}
                    style={{
                      height: `${10 + level * 70 * (0.3 + Math.abs(Math.sin(i * 1.8)))}px`,
                    }}
                  />
                ))}
              </div>
              <Button onClick={() => recorder.current?.stop()}>
                <Square size={16} />
                结束录音
              </Button>
            </>
          ) : draft ? (
            <>
              <audio
                key={draft.id}
                controls
                src={`speech://audio/${draft.id}`}
                onCanPlay={() => setDecoded(true)}
                onError={() => {
                  setDecoded(false);
                  setError("录音无法解码，请重录。");
                }}
              />
              {draft.error && <p className={s.error}>{draft.error}</p>}
              <Button
                disabled={
                  !decoded ||
                  !draft.bytes ||
                  !!draft.error?.includes("有效声音")
                }
                onClick={() => nav(`/result/${session.id}`)}
              >
                回放确认与提交
                <ArrowRight size={16} />
              </Button>
              <button
                className={s.textButton}
                onClick={() =>
                  void action(async () => {
                    await window.api.discard(draft.id);
                    setDraft(null);
                  })
                }
              >
                放弃这次草稿，重新录音
              </button>
            </>
          ) : (
            <Button disabled={busy} onClick={() => void record()}>
              <Mic size={18} />
              {busy ? "准备麦克风…" : "开始 2 分钟演讲"}
            </Button>
          )}
          <div className={s.privacy}>
            <span className={s.greenDot} />
            录音先保存本地，确认后才会上传
          </div>
        </section>
      </div>
      {error && (
        <div role="alert" className={s.error}>
          {error}
        </div>
      )}
      <div className={s.guide}>
        <Lightbulb size={20} />
        <div>
          <strong>
            {session.phase === "research"
              ? "先理解，不急着记住每一句话。"
              : session.phase === "organize"
                ? "把资料放在一边，试着自己组织答案。"
                : "讲不清的地方，就是下一次学习的方向。"}
          </strong>
          <p>资料由你自行查找。可以切换到浏览器，悬浮窗会显示剩余时间。</p>
        </div>
      </div>
    </div>
  );
}
function Consent({
  settings,
  checked,
  setChecked,
  textOnly = false,
}: {
  settings: Settings | null;
  checked: boolean;
  setChecked: (x: boolean) => void;
  textOnly?: boolean;
}) {
  return (
    <label className={s.consent}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => setChecked(e.target.checked)}
      />
      <span>
        {settings?.mode === "demo"
          ? "使用离线演示：不上传内容，转写与反馈是示例，不代表实际录音。"
          : textOnly
            ? `我同意将当前转写文字和本地指标发送至 ${settings?.feedback.recipient}（${settings?.feedback.baseUrl}），${settings?.feedback.retention || "留存政策待确认。"}`
            : `我同意将录音发送至 ${settings?.transcription.recipient}（${settings?.transcription.baseUrl}）进行转写，再将转写文字和本地指标发送至 ${settings?.feedback.recipient}（${settings?.feedback.baseUrl}）进行表达分析。两项留存政策分别为：${settings?.transcription.retention || "待确认"}；${settings?.feedback.retention || "待确认"}。可能产生费用。`}
      </span>
    </label>
  );
}
function Result() {
  const { id } = useParams();
  const nav = useNavigate();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selected, setSelected] = useState("");
  const [revisionId, setRevisionId] = useState("");
  const [text, setText] = useState("");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [decoded, setDecoded] = useState(false);
  const refresh = async () => {
    const d = await window.api.detail(id!);
    setDetail(d);
    setSelected((v) => v || d.attempts.at(-1)?.id || "");
  };
  useEffect(() => {
    void refresh().catch((e) => setError(errorMessage(e)));
    void window.api.settings().then(setSettings);
  }, [id]);
  const attempt = detail?.attempts.find((a) => a.id === selected);
  const revisions =
    detail?.revisions.filter((r) => r.attemptId === selected) || [];
  const revision =
    revisions.find((r) => r.id === revisionId) || revisions.at(-1);
  const run = detail?.runs.filter((r) => r.revisionId === revision?.id).at(-1);
  useEffect(() => {
    setRevisionId("");
    setDecoded(false);
  }, [selected]);
  useEffect(() => setText(revision?.text || ""), [revision?.id]);
  async function work(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
      setRevisionId("");
    } catch (e) {
      setError(errorMessage(e));
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  if (!detail) return <div className={s.page}>{error || "正在读取训练…"}</div>;
  return (
    <div className={s.page}>
      <div className={s.eyebrow}>REFLECTION · 每一次表达，都值得回看</div>
      <div className={s.headingRow}>
        <div>
          <h1 className={s.smaller}>{detail.session.topic.title}</h1>
          <p className={s.lead}>留下讲得好的地方，也找到下一步。</p>
        </div>
        <Button
          secondary
          disabled={busy}
          onClick={() =>
            void work(async () => {
              await window.api.retell(id!);
              nav("/training");
            })
          }
        >
          <RefreshCw size={16} />
          补充提纲 · 同题再讲
        </Button>
      </div>
      <div className={s.attemptTabs}>
        {detail.attempts.map((a) => (
          <button
            disabled={busy}
            key={a.id}
            className={selected === a.id ? s.selected : ""}
            onClick={() => setSelected(a.id)}
          >
            第 {a.number} 次演讲{a.status === "feedback" && <Check size={14} />}
          </button>
        ))}
      </div>
      {!attempt ? (
        <div className={s.empty}>
          还没有录音。
          <Button
            onClick={() =>
              void work(async () => {
                await window.api.openSession(id!);
                nav("/training");
              })
            }
          >
            继续训练
          </Button>
        </div>
      ) : (
        <>
          <div className={s.resultTop}>
            <div>
              <Volume2 size={18} />
              <strong>回听自己的表达</strong>
              <small>
                {time(attempt.durationMs)} · {(attempt.bytes / 1024).toFixed(0)}{" "}
                KB
              </small>
            </div>
            <audio
              key={attempt.id}
              controls
              src={`speech://audio/${attempt.id}`}
              onCanPlay={() => setDecoded(true)}
              onError={() => setError("录音无法播放，请返回训练页重录。")}
            />
          </div>
          {attempt.error && <p className={s.error}>{attempt.error}</p>}
          {!revision ? (
            <section className={s.panel}>
              <h2>准备好获得反馈了吗？</h2>
              <p className={s.muted}>
                先回听录音，再确认提交。服务失败时，录音与提纲仍保留在本机。
              </p>
              <Consent
                settings={settings}
                checked={consent}
                setChecked={setConsent}
              />
              <Button
                disabled={
                  busy ||
                  !consent ||
                  !decoded ||
                  !attempt.bytes ||
                  !!attempt.error?.includes("有效声音")
                }
                onClick={() =>
                  void work(() => window.api.submit(attempt.id, consent))
                }
              >
                <Sparkles size={17} />
                {busy
                  ? "转写与分析中，请稍候…"
                  : attempt.submitted
                    ? "确认费用风险并重试"
                    : "确认提交，获取反馈"}
              </Button>
            </section>
          ) : (
            <div className={s.resultGrid}>
              <section className={s.panel}>
                <div className={s.sectionTitle}>
                  <h2>演讲转写</h2>
                  <select
                    aria-label="转写版本"
                    value={revision?.id}
                    disabled={busy}
                    onChange={(e) => setRevisionId(e.target.value)}
                  >
                    {revisions.map((r) => (
                      <option key={r.id} value={r.id}>
                        版本 {r.version} ·{" "}
                        {r.source === "asr" ? "原始转写" : "校正文本"}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  aria-label="演讲转写"
                  maxLength={30000}
                  className={s.transcript}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <p className={s.muted}>
                  校正后会保存为新版本，原始转写始终保留。
                </p>
                <Consent
                  settings={settings}
                  checked={consent}
                  setChecked={setConsent}
                  textOnly
                />
                <Button
                  disabled={busy || !consent || !text.trim()}
                  onClick={() =>
                    void work(() =>
                      window.api.analyze(attempt.id, text, consent),
                    )
                  }
                >
                  {busy ? "正在分析…" : "保存校正并重新分析"}
                  <ArrowRight size={16} />
                </Button>
              </section>
              <section className={s.feedback}>
                {run ? (
                  <>
                    <div className={s.sectionTitle}>
                      <Sparkles size={20} />
                      <h2>表达反馈</h2>
                      <Badge>
                        {run.model === "离线演示"
                          ? "离线演示"
                          : `转写 v${revision.version}`}
                      </Badge>
                    </div>
                    <FeedbackView feedback={run.result} />
                    <div className={s.helpful}>
                      这次反馈对你有帮助吗？
                      <button
                        disabled={busy}
                        className={run.helpful === true ? s.selected : ""}
                        onClick={() =>
                          void work(() => window.api.helpful(run.id, true))
                        }
                      >
                        有帮助
                      </button>
                      <button
                        disabled={busy}
                        className={run.helpful === false ? s.selected : ""}
                        onClick={() =>
                          void work(() => window.api.helpful(run.id, false))
                        }
                      >
                        还不够
                      </button>
                    </div>
                  </>
                ) : (
                  <div className={s.empty}>
                    <Sparkles size={32} />
                    <h2>转写已保存</h2>
                    <p>
                      此版本暂无反馈。确认左侧文字后，可单独重试分析，无需再次上传录音。
                    </p>
                  </div>
                )}
              </section>
            </div>
          )}
        </>
      )}
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
function FeedbackView({ feedback: f }: { feedback: Feedback }) {
  return (
    <>
      <p className={s.summary}>{f.summary}</p>
      <div className={s.dimensions}>
        {[
          ["理解", f.dimensions.understanding],
          ["结构", f.dimensions.structure],
          ["通俗程度", f.dimensions.simplicity],
        ].map(([k, v]) => (
          <div key={k}>
            <Badge>{k}</Badge>
            <p>{v}</p>
          </div>
        ))}
      </div>
      <h3>值得保留</h3>
      {f.strengths.map((v, i) => (
        <p className={s.good} key={i}>
          <Check size={16} />
          {v}
        </p>
      ))}
      <h3>下一次，优先试试</h3>
      {f.improvements.length ? (
        f.improvements.map((v, i) => (
          <div className={s.improvement} key={i}>
            <blockquote>“{v.quote}”</blockquote>
            <p>{v.advice}</p>
          </div>
        ))
      ) : (
        <p>本次没有明显需要优先改进的地方。</p>
      )}
      <h3>一版更简单的表达</h3>
      <p className={s.simplified}>{f.simplified}</p>
      <h3>带着问题，继续补学</h3>
      {f.questions.map((q, i) => (
        <p key={i}>· {q}</p>
      ))}
      {f.uncertainties.map((q, i) => (
        <p className={s.uncertain} key={i}>
          待核实 · {q.replace(/^待核实[：:]?\s*/, "")}
        </p>
      ))}
    </>
  );
}
function HistoryPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<Api["history"]>>>([]);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const nav = useNavigate();
  const refresh = () => window.api.history().then(setRows);
  useEffect(() => {
    void refresh().catch((e) => setError(errorMessage(e)));
  }, []);
  return (
    <div className={s.page}>
      <div className={s.headingRow}>
        <div>
          <div className={s.eyebrow}>YOUR LEARNING JOURNEY</div>
          <h1>每一次开口，都算数。</h1>
          <p className={s.lead}>
            {rows.length} 次训练 · {rows.filter((r) => r.completed).length}{" "}
            次完成反馈 · 本地录音{" "}
            {(rows.reduce((n, r) => n + r.bytes, 0) / 1024 / 1024).toFixed(1)}{" "}
            MB
          </p>
        </div>
        <Button onClick={() => nav("/")}>
          <Plus size={17} />
          新的练习
        </Button>
      </div>
      {rows.length ? (
        <div className={s.historyList}>
          {rows.map((r) => (
            <div className={s.historyRow} key={r.id}>
              <div className={s.historyIcon}>
                <AudioLines size={24} />
              </div>
              <button
                className={s.historyTitle}
                onClick={() => nav(`/result/${r.id}`)}
              >
                <Badge>{r.topic.category}</Badge>
                <h3>{r.topic.title}</h3>
                <p>
                  {new Date(r.createdAt).toLocaleString("zh-CN")} · {r.count}{" "}
                  次演讲
                </p>
              </button>
              <span className={r.completed ? s.completed : s.muted}>
                {r.completed ? "已完成反馈" : "待继续"}
              </span>
              <button
                className={s.iconButton}
                aria-label={`继续${r.topic.title}`}
                onClick={() =>
                  void window.api
                    .openSession(r.id)
                    .then(() => nav("/training"))
                    .catch((e) => setError(errorMessage(e)))
                }
              >
                <Play size={18} />
              </button>
              <button
                className={s.iconButton}
                aria-label={`删除${r.topic.title}`}
                onClick={() => setDeleting(r.id)}
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className={s.empty}>
          <History size={40} />
          <h2>你的第一条练习记录，正在等你</h2>
          <p>锁定一个主题，就会自动保存到这里。</p>
          <Button onClick={() => nav("/")}>开始第一次练习</Button>
        </div>
      )}
      <p className={s.muted}>
        所有记录仅在这台设备保存。完成率按有反馈的训练次数计算，同题重讲不会重复计数。
      </p>
      {deleting && (
        <div className={s.modalBackdrop}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="删除训练"
            className={s.modal}
          >
            <h2>删除这条训练？</h2>
            <p>
              本设备中的全部录音、转写版本、反馈和相关任务将一并删除，无法撤销。
            </p>
            <p className={s.muted}>此操作不代表服务商已删除其留存的数据。</p>
            <div className={s.topicActions}>
              <Button secondary onClick={() => setDeleting(null)}>
                取消
              </Button>
              <Button
                onClick={() => {
                  void window.api
                    .remove(deleting)
                    .then(() => {
                      setDeleting(null);
                      return refresh();
                    })
                    .catch((e) => {
                      setError(errorMessage(e));
                      setDeleting(null);
                    });
                }}
              >
                确认删除
              </Button>
            </div>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
    </div>
  );
}
function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [transcriptionKey, setTranscriptionKey] = useState("");
  const [feedbackKey, setFeedbackKey] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void window.api.settings().then(setSettings);
  }, []);
  if (!settings) return <div className={s.page}>加载设置…</div>;
  return (
    <div className={s.page}>
      <div className={s.eyebrow}>SETTINGS</div>
      <h1>为你的练习，做好准备。</h1>
      <p className={s.lead}>
        单设备使用，无需注册。AI 服务只在确认提交后调用。
      </p>
      <section className={`${s.panel} ${s.settings}`}>
        <h2>服务配置</h2>
        <label>
          运行模式
          <select
            value={settings.mode}
            onChange={(e) =>
              setSettings({
                ...settings,
                mode: e.target.value as "demo" | "cloud",
              })
            }
          >
            <option value="demo">离线演示 · 不上传，不提供真实评价</option>
            <option value="cloud">云端服务 · 使用自己的 API Key</option>
          </select>
        </label>
        <div className={s.notice}>
          转写和评价使用独立连接。multipart-asr-v1 适用于专用 ASR；
          multimodal-chat-audio-v1 适用于支持音频输入的多模态接口；
          chat-json-v1 用于结构化文字评价。
        </div>
        <ServiceSettings
          title="语音转写"
          value={settings.transcription}
          hasKey={settings.transcriptionHasKey}
          apiKey={transcriptionKey}
          setApiKey={setTranscriptionKey}
          onChange={(transcription) => setSettings({ ...settings, transcription })}
        />
        <ServiceSettings
          title="演讲评价"
          value={settings.feedback}
          hasKey={settings.feedbackHasKey}
          apiKey={feedbackKey}
          setApiKey={setFeedbackKey}
          onChange={(feedback) => setSettings({ ...settings, feedback })}
        />
        <label className={s.consent}>
          <input
            type="checkbox"
            checked={settings.reuseTranscriptionConnection}
            onChange={(e) =>
              setSettings({
                ...settings,
                reuseTranscriptionConnection: e.target.checked,
              })
            }
          />
          <span>评价复用转写地址、接收方和密钥引用（评价适配器与模型仍独立）。</span>
        </label>
        <p className={s.muted}>
          保存不会发送测试请求。密钥仅传给主进程，不会进入 renderer、任务快照或日志。
        </p>
        <label>
          {settings.transcriptionHasKey || settings.feedbackHasKey
            ? "API Key 已配置（分别留空保留）"
            : "API Key 尚未配置"}
          <input
            type="hidden"
            autoComplete="off"
            value=""
            readOnly
          />
        </label>
        <p className={s.muted}>
          {settings.persistentKey
            ? "密钥使用 Windows 系统加密保存，不写入源码或日志。"
            : "系统加密不可用，密钥仅在本次运行中保存。"}
        </p>
        <div className={s.topicActions}>
          <Button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void window.api
                .saveSettings({
                  ...settings,
                  ...(transcriptionKey ? { transcriptionKey } : {}),
                  ...(feedbackKey ? { feedbackKey } : {}),
                })
                .then((v) => {
                  setSettings(v);
                  setTranscriptionKey("");
                  setFeedbackKey("");
                  setMessage("设置已保存。");
                })
                .catch((e) => setMessage(errorMessage(e)))
                .finally(() => setBusy(false));
            }}
          >
            保存设置
            <Check size={17} />
          </Button>
          {(settings.transcriptionHasKey || settings.feedbackHasKey) && (
            <Button
              secondary
              disabled={busy}
              onClick={() => {
                void window.api
                  .saveSettings({
                    ...settings,
                    transcriptionKey: "",
                    feedbackKey: "",
                  })
                  .then((v) => {
                    setSettings(v);
                    setMessage("密钥已清除。");
                  })
                  .catch((e) => setMessage(errorMessage(e)));
              }}
            >
              清除密钥
            </Button>
          )}
        </div>
        {message && <p role="status">{message}</p>}
      </section>
    </div>
  );
}
function ServiceSettings({
  title,
  value,
  hasKey,
  apiKey,
  setApiKey,
  onChange,
}: {
  title: string;
  value: Settings["transcription"];
  hasKey: boolean;
  apiKey: string;
  setApiKey: (value: string) => void;
  onChange: (value: Settings["transcription"]) => void;
}) {
  return (
    <fieldset className={s.serviceGroup}>
      <legend>{title}</legend>
      {(
        [
          ["providerName", "服务商名称"],
          ["adapterId", "接口适配器"],
          ["baseUrl", "HTTPS API 地址"],
          ["model", "模型"],
          ["recipient", "接收方"],
          ["retention", "数据留存说明"],
        ] as const
      ).map(([field, label]) => (
        <label key={field}>
          {label}
          <input
            value={value[field]}
            onChange={(e) => onChange({ ...value, [field]: e.target.value })}
          />
        </label>
      ))}
      <label>
        API Key {hasKey ? "（已配置，留空保留）" : ""}
        <input
          type="password"
          autoComplete="off"
          value={apiKey}
          placeholder="仅传给主进程，不回显已有密钥"
          onChange={(e) => setApiKey(e.target.value)}
        />
      </label>
    </fieldset>
  );
}
function Floating() {
  const { snapshot } = useTraining();
  const session = snapshot.session;
  return (
    <div className={s.floating}>
      <header>
        <span>
          <span className={s.greenDot} />
          言之有物 · {session ? phaseNames[session.phase] : "等待训练"}
        </span>
        <button
          aria-label="隐藏悬浮窗"
          onClick={() => void window.api.floating(false)}
        >
          <X size={16} />
        </button>
      </header>
      <strong>{session?.topic.title || "开始一个新主题"}</strong>
      <div className={s.floatTimer}>
        {time(
          snapshot.recordingId
            ? snapshot.recordingRemainingMs
            : session?.remainingMs || 0,
        )}
        <span>
          {snapshot.recordingId
            ? "录音中"
            : session?.paused
              ? "已暂停"
              : session?.phase === "ready"
                ? "等待录音"
                : "剩余时间"}
        </span>
      </div>
      <footer>
        <button
          disabled={!session || session.phase === "ready"}
          onClick={() =>
            void (session?.paused
              ? window.api.resume(snapshot.version)
              : window.api.pause(snapshot.version))
          }
        >
          {session?.paused ? <Play size={15} /> : <Pause size={15} />}{" "}
          {session?.paused ? "继续" : "暂停"}
        </button>
        <button onClick={() => void window.api.showMain()}>
          返回训练
          <ArrowUpRight size={15} />
        </button>
      </footer>
    </div>
  );
}
