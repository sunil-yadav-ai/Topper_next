"use client";

import { useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CircleHelp,
  Clock3,
  Lightbulb,
  LoaderCircle,
  MessageCircle,
  RotateCcw,
  Sparkles,
  StopCircle,
  Target,
  Timer,
  X,
} from "lucide-react";
import { api } from "../../lib/api.js";
import { gsap } from "../../lib/gsap.js";
import { useAuth } from "../../context/AuthContext.jsx";

gsap.registerPlugin(useGSAP);

const difficultyLabels = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  advanced: "Advanced",
};
const answerTimeOptions = [10, 15, 20, 30, 45, 60, 90, 120];

function errorText(error) {
  return error.response?.data?.message ?? error.message ?? "AI Practice is unavailable right now.";
}

function StudyField({ label, value, onChange, placeholder, maxLength = 160 }) {
  return (
    <label className="practice-field">
      <span>{label}</span>
      <input
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required
        value={value}
      />
    </label>
  );
}

function PracticeHistory({ sessions, onAgain }) {
  if (!sessions.length) {
    return (
      <div className="practice-history-empty">
        <BookOpen aria-hidden="true" />
        <p>Your completed sessions will be saved here.</p>
      </div>
    );
  }
  return (
    <div className="practice-history-list">
      {sessions.map((session) => (
        <article className="practice-history-item" key={session.id}>
          <div className="practice-history-icon"><Target aria-hidden="true" /></div>
          <div className="practice-history-details">
            <strong>{session.subject}{session.topic ? ` · ${session.topic}` : ""}</strong>
            <span>{session.department} · {session.course} · Semester {session.semester}</span>
            <small>
              {session.attempted} attempted · {session.accuracy}% accuracy ·
              {" "}{difficultyLabels[session.highestDifficulty] ?? "Easy"} reached
            </small>
          </div>
          <button className="practice-icon-button" onClick={() => onAgain(session)} title="Practice this subject again" type="button">
            <RotateCcw aria-hidden="true" size={17} />
          </button>
        </article>
      ))}
    </div>
  );
}

export default function AiPracticePage() {
  const rootRef = useRef(null);
  const { user } = useAuth();
  const [selection, setSelection] = useState({
    department: user?.department ?? "",
    subject: "",
    answerTimeSeconds: 20,
  });
  const [session, setSession] = useState(null);
  const [report, setReport] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [questionPhase, setQuestionPhase] = useState("waiting");
  const [remainingMs, setRemainingMs] = useState(5000);
  const [selectedChoice, setSelectedChoice] = useState("");
  const timeoutQuestionRef = useRef("");
  const answerQuestionRef = useRef("");
  const nextQuestionRef = useRef("");

  const currentQuestion = session?.questions?.at(-1) ?? null;
  const answeredCount = (session?.correctCount ?? 0) + (session?.incorrectCount ?? 0);
  const questionAnswered = Boolean(currentQuestion?.answeredAt);

  useEffect(() => {
    let active = true;
    api.get("/ai-practice/history")
      .then(({ data }) => {
        if (!active) return;
        setHistory(data.sessions ?? []);
      })
      .catch((requestError) => {
        if (active) setError(errorText(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useGSAP(() => {
    const root = rootRef.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const question = root.querySelector(".practice-question-card");
    const feedback = root.querySelector(".practice-feedback");
    const progress = root.querySelector(".practice-progress-fill");
    const difficulty = root.querySelector(".practice-difficulty");
    if (question) gsap.fromTo(question, { y: 14, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.4, ease: "power2.out" });
    if (difficulty) gsap.fromTo(difficulty, { scale: 0.88, autoAlpha: 0.6 }, { scale: 1, autoAlpha: 1, duration: 0.34, ease: "back.out(1.7)" });
    if (feedback && currentQuestion?.isCorrect !== null && currentQuestion?.isCorrect !== undefined) {
      gsap.fromTo(
        feedback,
        {
          scale: currentQuestion.timedOut ? 0.82 : 0.96,
          rotation: currentQuestion.timedOut ? -2 : 0,
          x: currentQuestion.timedOut ? 0 : currentQuestion.isCorrect ? -3 : 3,
          autoAlpha: 0,
        },
        {
          scale: 1,
          rotation: 0,
          x: 0,
          autoAlpha: 1,
          duration: currentQuestion.timedOut ? 0.55 : 0.4,
          ease: currentQuestion.timedOut ? "elastic.out(1, 0.4)" : "back.out(1.7)",
        },
      );
    }
    if (progress) gsap.to(progress, { scaleX: Math.min(1, 0.12 + ((session?.questions?.length ?? 0) * 0.07)), duration: 0.5, ease: "power2.out" });
    const choices = root.querySelectorAll(".practice-timed-option");
    if (questionPhase === "answer" && choices.length) {
      gsap.fromTo(choices, { y: 10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.32, stagger: 0.06, ease: "power2.out" });
    }
    const messages = root.querySelectorAll(".practice-message");
    if (messages.length) gsap.fromTo(messages[messages.length - 1], { y: 10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.34, ease: "power2.out" });
    return undefined;
  }, { scope: rootRef, dependencies: [session?.questions?.length, currentQuestion?.isCorrect, currentQuestion?.timedOut, session?.currentDifficulty, questionPhase], revertOnUpdate: true });

  function changeSelection(field, value) {
    setError("");
    setNotice("");
    setSelection((current) => ({ ...current, [field]: value }));
  }

  async function loadHistory() {
    const { data } = await api.get("/ai-practice/history");
    setHistory(data.sessions ?? []);
  }

  async function startPractice(nextSelection = selection) {
    setBusy("start");
    setError("");
    setNotice("");
    setReport(null);
    setSelectedChoice("");
    setQuestionPhase("waiting");
    try {
      const { data } = await api.post("/ai-practice/sessions", {
        department: nextSelection.department,
        subject: nextSelection.subject,
        answerTimeSeconds: nextSelection.answerTimeSeconds,
      });
      if (!data.available) {
        setNotice(data.message);
        return;
      }
      setSession(data.session);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusy("");
    }
  }

  async function submitChoice(choice) {
    if (!session || !currentQuestion || questionPhase !== "answer" ||
      questionAnswered || answerQuestionRef.current === currentQuestion.id) return;
    answerQuestionRef.current = currentQuestion.id;
    setSelectedChoice(choice);
    setBusy("answer");
    setError("");
    try {
      const { data } = await api.post(`/ai-practice/sessions/${session.id}/answer`, {
        questionId: currentQuestion.id,
        answer: choice,
      });
      setSession(data.session);
    } catch (requestError) {
      answerQuestionRef.current = "";
      setSelectedChoice("");
      setError(errorText(requestError));
    } finally {
      setBusy("");
    }
  }

  async function handleQuestionTimeout(sessionId, questionId) {
    const requestKey = `${sessionId}:${questionId}`;
    if (timeoutQuestionRef.current === requestKey) return;
    timeoutQuestionRef.current = requestKey;
    setQuestionPhase("expired");
    setBusy("timeout");
    setError("");
    try {
      const { data } = await api.post(`/ai-practice/sessions/${sessionId}/timeout`, { questionId });
      setSession(data.session);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusy("");
    }
  }

  async function advanceToNext(questionId = currentQuestion?.id) {
    if (!session || !questionId || nextQuestionRef.current === questionId) return;
    nextQuestionRef.current = questionId;
    setBusy("next");
    setError("");
    try {
      const { data } = await api.post(`/ai-practice/sessions/${session.id}/next`, { questionId });
      setSession(data.session);
      setSelectedChoice("");
    } catch (requestError) {
      nextQuestionRef.current = "";
      setError(errorText(requestError));
    } finally {
      setBusy("");
    }
  }

  async function requestSessionAction(action) {
    if (!session) return;
    if (action === "next") {
      await advanceToNext();
      return;
    }
    setBusy(action);
    setError("");
    try {
      const { data } = await api.post(`/ai-practice/sessions/${session.id}/${action}`);
      if (data.session) setSession(data.session);
      if (data.hint && currentQuestion) {
        setSession((current) => current && ({
          ...current,
          questions: current.questions.map((question) =>
            question.id === currentQuestion.id ? { ...question, hint: data.hint } : question),
        }));
      }
      if (data.explanation && currentQuestion) {
        setSession((current) => current && ({
          ...current,
          questions: current.questions.map((question) =>
            question.id === currentQuestion.id ? { ...question, explainAgain: data.explanation } : question),
        }));
      }
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    if (!session || !currentQuestion || session.status !== "active") return undefined;
    if (currentQuestion.answeredAt) {
      setQuestionPhase("feedback");
      setRemainingMs(0);
      return undefined;
    }

    const sessionId = session.id;
    const questionId = currentQuestion.id;
    const revealAt = Date.parse(currentQuestion.optionsAvailableAt);
    const deadlineAt = Date.parse(currentQuestion.answerDeadlineAt);
    if (!Number.isFinite(revealAt) || !Number.isFinite(deadlineAt)) {
      setError("This question is missing its server timer. Please end this session and start a new one.");
      return undefined;
    }

    function updateClock() {
      if (selectedChoice || busy === "answer") return;
      const now = Date.now();
      if (now < revealAt) {
        setQuestionPhase("waiting");
        setRemainingMs(revealAt - now);
        return;
      }
      if (now < deadlineAt) {
        setQuestionPhase("answer");
        setRemainingMs(deadlineAt - now);
        return;
      }
      setRemainingMs(0);
      if (timeoutQuestionRef.current !== `${sessionId}:${questionId}`) {
        handleQuestionTimeout(sessionId, questionId);
      }
    }

    updateClock();
    const intervalId = window.setInterval(updateClock, 100);
    const revealTimeoutId = window.setTimeout(
      updateClock,
      Math.max(0, revealAt - Date.now()),
    );
    const deadlineTimeoutId = window.setTimeout(
      updateClock,
      Math.max(0, deadlineAt - Date.now()),
    );
    document.addEventListener("visibilitychange", updateClock);
    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(revealTimeoutId);
      window.clearTimeout(deadlineTimeoutId);
      document.removeEventListener("visibilitychange", updateClock);
    };
  }, [
    session?.id,
    session?.status,
    currentQuestion?.id,
    currentQuestion?.answeredAt,
    currentQuestion?.optionsAvailableAt,
    currentQuestion?.answerDeadlineAt,
    selectedChoice,
    busy,
  ]);

  useEffect(() => {
    if (!session || !currentQuestion?.answeredAt || session.status !== "active") return undefined;
    const questionId = currentQuestion.id;
    const timeoutId = window.setTimeout(() => advanceToNext(questionId), 2000);
    return () => window.clearTimeout(timeoutId);
  }, [session?.id, session?.status, currentQuestion?.id, currentQuestion?.answeredAt]);

  async function endPractice() {
    if (!session) return;
    setBusy("end");
    setError("");
    try {
      const { data } = await api.post(`/ai-practice/sessions/${session.id}/end`);
      setReport(data.report);
      setSession(null);
      await loadHistory();
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusy("");
    }
  }

  function practiceAgain(previousSession = session) {
    const previousSelection = previousSession ? {
      department: previousSession.department,
      subject: previousSession.subject,
      answerTimeSeconds: previousSession.answerTimeSeconds ?? 20,
    } : selection;
    setSelection(previousSelection);
    setSession(null);
    setReport(null);
    startPractice(previousSelection);
  }

  const isAnswering = busy === "answer";
  const optionsVisible = questionPhase === "answer" || (questionAnswered && !currentQuestion?.timedOut);
  const countdownSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const canStart = Boolean(
    selection.department && selection.subject,
  );

  return (
    <main className="practice-page" ref={rootRef}>
      <div className="practice-shell">
        <header className="practice-header">
          <div>
            <p className="practice-eyebrow"><Sparkles aria-hidden="true" size={15} /> YOUR PERSONAL AI TUTOR</p>
            <h1>AI Practice</h1>
            <p className="practice-subtitle">A learning session that adjusts to you, one question at a time.</p>
          </div>
          <button
            aria-expanded={showHistory}
            className="practice-history-toggle"
            onClick={() => setShowHistory((shown) => !shown)}
            type="button"
          >
            <Clock3 aria-hidden="true" size={17} />
            Practice history
            <span>{history.length}</span>
          </button>
        </header>

        {error && <div className="practice-alert" role="alert"><CircleHelp aria-hidden="true" />{error}</div>}
        {notice && <div className="practice-notice" role="status"><BookOpen aria-hidden="true" />{notice}</div>}

        {showHistory && (
          <section aria-label="Practice history" className="practice-history-panel">
            <div className="practice-section-heading">
              <div><p className="practice-eyebrow">YOUR LEARNING JOURNEY</p><h2>Practice history</h2></div>
              <button aria-label="Close practice history" className="practice-icon-button" onClick={() => setShowHistory(false)} type="button"><X size={18} /></button>
            </div>
            <PracticeHistory onAgain={practiceAgain} sessions={history} />
          </section>
        )}

        {loading ? (
          <div className="practice-loading"><LoaderCircle aria-hidden="true" className="practice-spin" /> Loading practice history…</div>
        ) : report ? (
          <section aria-labelledby="practice-report-title" className="practice-report">
            <div className="practice-report-head">
              <span className="practice-report-mark"><Check aria-hidden="true" /></span>
              <p className="practice-eyebrow">SESSION COMPLETE</p>
              <h2 id="practice-report-title">Look how far you got.</h2>
              <p>{selection.subject} · {selection.department}</p>
            </div>
            <div className="practice-report-stats">
              <div><strong>{report.totalAttempted}</strong><span>Questions attempted</span></div>
              <div><strong>{report.accuracy}%</strong><span>Accuracy</span></div>
              <div><strong>{difficultyLabels[report.difficultyReached]}</strong><span>Difficulty reached</span></div>
              <div><strong>{Math.floor(report.durationSeconds / 60)}m</strong><span>Practice time</span></div>
            </div>
            <div className="practice-report-columns">
              <ReportList title="Strong concepts" items={report.strongConcepts} empty="Keep building your strengths." tone="strong" />
              <ReportList title="Worth another look" items={report.weakConcepts} empty="No weak concepts yet — lovely work." tone="review" />
            </div>
            {report.recommendedTopics?.length > 0 && (
              <div className="practice-recommendations">
                <h3>Recommended next topics</h3>
                <div>{report.recommendedTopics.map((topic) => <span key={topic}>{topic}</span>)}</div>
              </div>
            )}
            <button className="practice-primary-button" onClick={() => practiceAgain(null)} type="button">
              <RotateCcw aria-hidden="true" size={18} /> Practice again
            </button>
          </section>
        ) : session ? (
          <section aria-label="AI practice session" className="practice-session">
            <div className="practice-session-top">
              <button className="practice-back-button" disabled={busy !== ""} onClick={endPractice} type="button"><ArrowLeft aria-hidden="true" size={16} /> End session</button>
              <div className="practice-session-subject">
                <span>{session.subject}{session.topic ? ` · ${session.topic}` : ""}</span>
                <small>{session.department} · {session.course} · Semester {session.semester}</small>
              </div>
              <span className={`practice-difficulty practice-difficulty-${session.currentDifficulty}`}>
                <span aria-hidden="true" />{difficultyLabels[session.currentDifficulty]}
              </span>
            </div>
            <div aria-label={`${session.questions.length} questions explored`} className="practice-progress-track" role="progressbar" aria-valuemax="100" aria-valuemin="0" aria-valuenow={Math.min(100, Math.round(12 + session.questions.length * 7))}>
              <span className="practice-progress-fill" />
            </div>
            <div className="practice-question-meta">
              <span>Question {session.questions.length}</span>
              <span>{answeredCount} answered · {session.correctCount} correct</span>
            </div>

            <article className="practice-question-card">
              <div className="practice-ai-avatar"><Sparkles aria-hidden="true" size={18} /></div>
              <div aria-live="polite" className="practice-message">
                <p className="practice-message-label">YOUR AI TUTOR <span>· {currentQuestion?.concept}</span></p>
                <h2>{currentQuestion?.question}</h2>
                {!questionAnswered && questionPhase === "waiting" && (
                  <div aria-live="polite" className="practice-question-countdown" role="timer">
                    <span>{countdownSeconds}</span>
                    <div><strong>Get ready</strong><small>Answer choices unlock in {countdownSeconds} seconds</small></div>
                  </div>
                )}
                {!questionAnswered && questionPhase === "answer" && (
                  <div className="practice-answer-clock">
                    <div><Timer aria-hidden="true" size={17} /><strong>{countdownSeconds}s</strong><span>to choose</span></div>
                    <div
                      aria-label={`${countdownSeconds} seconds remaining`}
                      className="practice-answer-progress"
                      role="progressbar"
                      aria-valuemax={session.answerTimeSeconds ?? 20}
                      aria-valuemin="0"
                      aria-valuenow={countdownSeconds}
                    >
                      <span
                        className="practice-answer-progress-fill"
                        style={{ transform: `scaleX(${Math.max(0, Math.min(1, remainingMs / ((session.answerTimeSeconds ?? 20) * 1000)))})` }}
                      />
                    </div>
                  </div>
                )}
                {optionsVisible && currentQuestion?.type === "mcq" && (
                  <div className="practice-choices" role="group" aria-label="Choose one answer">
                    {currentQuestion.choices.map((choice, index) => {
                      const choiceSelected = (questionAnswered ? currentQuestion.studentAnswer : selectedChoice) === choice;
                      return (
                        <button
                          aria-pressed={choiceSelected}
                          className={`practice-choice practice-timed-option${choiceSelected ? " is-selected" : ""}${choiceSelected && currentQuestion.isCorrect ? " is-answer-correct" : ""}${choiceSelected && questionAnswered && !currentQuestion.isCorrect ? " is-answer-incorrect" : ""}`}
                          key={`${choice}-${index}`}
                          disabled={questionAnswered || Boolean(selectedChoice) || isAnswering || questionPhase !== "answer"}
                          onClick={() => submitChoice(choice)}
                          type="button"
                        >
                          <span>{String.fromCharCode(65 + index)}</span>{choice}
                          {choiceSelected && isAnswering && <LoaderCircle aria-hidden="true" className="practice-spin" size={16} />}
                        </button>
                      );
                    })}
                  </div>
                )}
                {questionAnswered && (
                  <div className={`practice-feedback${currentQuestion.timedOut ? " is-timeout" : currentQuestion.isCorrect ? " is-correct" : " is-incorrect"}`} role="status">
                    <strong>{currentQuestion.timedOut ? "Time’s Up!" : currentQuestion.isCorrect ? "That’s right!" : "Not quite — here’s the answer."}</strong>
                    <p>{currentQuestion.feedback}</p>
                    {!currentQuestion.timedOut && <p>{currentQuestion.explanation}</p>}
                  </div>
                )}
                {currentQuestion?.explainAgain && <div className="practice-explanation"><Lightbulb aria-hidden="true" /><p>{currentQuestion.explainAgain}</p></div>}
                {currentQuestion?.hint && !questionAnswered && (
                  <div className="practice-explanation practice-hint"><Lightbulb aria-hidden="true" /><p><strong>A little hint:</strong> {currentQuestion.hint}</p></div>
                )}
                <div className="practice-question-actions">
                  {!questionAnswered && (
                    <>
                      <button disabled={busy !== "" || questionPhase !== "answer"} onClick={() => requestSessionAction("hint")} type="button"><Lightbulb aria-hidden="true" size={16} /> Hint</button>
                      <button disabled={busy !== "" || questionPhase !== "answer"} onClick={() => requestSessionAction("explain")} type="button"><MessageCircle aria-hidden="true" size={16} /> Explain again</button>
                    </>
                  )}
                  {questionAnswered && (
                    <>
                      <span className="practice-auto-next-note">Next question in 2 seconds</span>
                      <button className="practice-next-button" disabled={busy !== ""} onClick={() => advanceToNext(currentQuestion.id)} type="button">
                        {busy === "next" ? <LoaderCircle aria-hidden="true" className="practice-spin" size={16} /> : <ArrowRight aria-hidden="true" size={16} />}
                        {busy === "next" ? "Loading…" : "Next question"}
                      </button>
                    </>
                  )}
                </div>
                {!questionAnswered && questionPhase === "expired" && busy !== "timeout" && error && (
                  <button
                    className="practice-timeout-retry"
                    onClick={() => {
                      timeoutQuestionRef.current = "";
                      handleQuestionTimeout(session.id, currentQuestion.id);
                    }}
                    type="button"
                  >
                    Retry recording timeout
                  </button>
                )}
              </div>
            </article>
            <div className="practice-session-footer">
              <span><StopCircle aria-hidden="true" size={15} /> Your progress is saved as you go.</span>
              <button disabled={busy !== ""} onClick={endPractice} type="button"><StopCircle aria-hidden="true" size={16} /> End session</button>
            </div>
          </section>
        ) : (
          <section className="practice-start">
            <div className="practice-start-copy">
              <span className="practice-illustration"><Sparkles aria-hidden="true" /></span>
              <p className="practice-eyebrow">LEARN AT YOUR OWN PACE</p>
              <h2>What would you like to explore?</h2>
              <p>Choose your study area. Your tutor will start gently, listen to your answers, and shape each next question around what you know.</p>
            </div>
            <div className="practice-selection-card">
              <div className="practice-selection-grid">
                <StudyField label="Department" maxLength={120} onChange={(value) => changeSelection("department", value)} placeholder="e.g. Computer Science" value={selection.department} />
                <StudyField label="Subject" onChange={(value) => changeSelection("subject", value)} placeholder="Enter any subject, e.g. Python" value={selection.subject} />
                <label className="practice-field">
                  <span>Answer time per question</span>
                  <select
                    onChange={(event) => changeSelection("answerTimeSeconds", Number(event.target.value))}
                    value={selection.answerTimeSeconds}
                  >
                    {answerTimeOptions.map((seconds) => (
                      <option key={seconds} value={seconds}>{seconds} seconds</option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="practice-source-note"><BookOpen aria-hidden="true" size={15} /> Enter any department and subject, then choose how long you get for each answer. The timer starts when the answer choices appear. When matching notes are available, your tutor uses them; otherwise, it starts with general subject knowledge.</p>
              <button className="practice-primary-button practice-start-button" disabled={!canStart || busy !== ""} onClick={() => startPractice()} type="button">
                {busy === "start" ? <LoaderCircle aria-hidden="true" className="practice-spin" size={18} /> : <Sparkles aria-hidden="true" size={18} />}
                {busy === "start" ? "Preparing your first question…" : "Start practice"}
                {busy !== "start" && <ArrowRight aria-hidden="true" size={17} />}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function ReportList({ title, items, empty, tone }) {
  return (
    <section className={`practice-report-list is-${tone}`}>
      <h3>{title}</h3>
      {items.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{empty}</p>}
    </section>
  );
}

