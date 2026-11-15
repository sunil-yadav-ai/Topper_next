import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  CircleStop,
  LoaderCircle,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { useGSAP } from "@gsap/react";
import { api } from "../lib/api.js";
import { gsap } from "../lib/gsap.js";
import { useAuth } from "../context/AuthContext.jsx";

gsap.registerPlugin(useGSAP);

const difficultyLabels = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  advanced: "Advanced",
};
const tutorRequestConfig = { timeout: 100_000 };

function getErrorMessage(error) {
  return error.response?.data?.message ?? error.message ?? "The tutor request failed.";
}

function addCompletedSession(history, session) {
  return {
    ...history,
    activeSession: null,
    previousSessions: [
      {
        id: session.id,
        correctCount: session.correctCount,
        incorrectCount: session.incorrectCount,
        questionsAsked: session.questionsAnswered,
        totalQuestions: session.totalQuestions,
        scorePercent: session.scorePercent,
        strongConcepts: session.strongConcepts,
        weakConcepts: session.weakConcepts,
        createdAt: session.createdAt,
        completedAt: session.completedAt,
      },
      ...(history?.previousSessions ?? []).filter((item) => item.id !== session.id),
    ].slice(0, 5),
  };
}

export default function AdaptiveTutor({ noteId, resourceType }) {
  const { user } = useAuth();
  const rootRef = useRef(null);
  const conversationRef = useRef(null);
  const questionRef = useRef(null);
  const [history, setHistory] = useState(null);
  const [session, setSession] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState("");
  const [error, setError] = useState("");

  const questionsAnswered = session?.questionsAnswered ?? 0;
  const answeredCorrectly = session?.correctCount ?? 0;
  const accuracy = session?.scorePercent ?? 0;
  const currentQuestion = session?.status === "active"
    ? [...(session.questions ?? [])].reverse().find((question) => !question.answeredAt)
    : null;

  useEffect(() => {
    if (user?.role !== "user") return undefined;
    let active = true;
    api.get(`/learning-tutor/notes/${noteId}`)
      .then(({ data }) => {
        if (!active) return;
        setHistory(data);
        if (data.activeSession) {
          setSession(data.activeSession);
          setIsOpen(true);
        }
      })
      .catch((requestError) => {
        if (active) setError(getErrorMessage(requestError));
      });
    return () => {
      active = false;
    };
  }, [noteId, user?.role]);

  useGSAP(() => {
    const node = questionRef.current;
    if (!node || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    gsap.fromTo(
      node,
      { y: 12, autoAlpha: 0 },
      { y: 0, autoAlpha: 1, duration: 0.42, ease: "power3.out", clearProps: "transform" },
    );
    return undefined;
  }, { scope: rootRef, dependencies: [currentQuestion?.id], revertOnUpdate: true });

  useEffect(() => {
    const conversation = conversationRef.current;
    if (!conversation) return;
    conversation.scrollTo({
      top: conversation.scrollHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [session?.questions.length, session?.questionsAnswered]);

  async function runAction(action, task) {
    setBusy(true);
    setPendingAction(action);
    setError("");
    try {
      await task();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
      setPendingAction("");
    }
  }

  function startLearning() {
    void runAction("start", async () => {
      const { data } = await api.post(
        `/learning-tutor/notes/${noteId}/start`,
        {},
        tutorRequestConfig,
      );
      if (!data.available) {
        setHistory((current) => ({
          ...current,
          available: false,
          unavailableMessage: data.message,
        }));
        return;
      }
      setSession(data.session);
      setIsOpen(true);
    });
  }

  function chooseAnswer(answer) {
    if (!session || !currentQuestion || busy) return;
    void runAction("answer", async () => {
      const { data } = await api.post(
        `/learning-tutor/sessions/${session.id}/answer`,
        { answer },
        tutorRequestConfig,
      );
      setSession(data.session);
      if (data.session.status === "completed") {
        setHistory((current) => addCompletedSession(current, data.session));
      }
      if (data.nextQuestionError) setError(data.nextQuestionError);
    });
  }

  function endSession() {
    if (!session) return;
    void runAction("end", async () => {
      const { data } = await api.post(
        `/learning-tutor/sessions/${session.id}/end`,
        {},
        tutorRequestConfig,
      );
      setSession(data.session);
      setHistory((current) => addCompletedSession(current, data.session));
    });
  }

  const isNote = resourceType === "note" && user?.role === "user";
  if (!isNote) return null;

  return (
    <section aria-label="AI learning tutor" className="ed-tutor" ref={rootRef}>
      <header className="ed-tutor-header">
        <div className="ed-tutor-heading">
          <span aria-hidden="true" className="ed-tutor-icon"><Sparkles size={20} /></span>
          <div>
            <p className="ed-tutor-eyebrow">PERSONAL STUDY COMPANION</p>
            <h2>AI Tutor</h2>
          </div>
        </div>
        {session && (
          <span className={`ed-tutor-level is-${session.currentDifficulty}`}>
            {difficultyLabels[session.currentDifficulty]}
          </span>
        )}
      </header>

      {!isOpen && (
        <>
          <div className="ed-tutor-intro">
            <div className="ed-tutor-intro-copy">
              <h3>Practice {history?.topic || "this resource"} one question at a time.</h3>
              <p>
                {history?.subject && history?.topic
                  ? `10 multiple-choice questions about ${history.topic} in ${history.subject}.`
                  : "Questions are created automatically from this resource's details."}
                {" "}Choose an option to answer—no typing required.
              </p>
            </div>
          </div>
          <div className="ed-tutor-start">
            {history?.available === false ? (
              <p className="ed-tutor-unavailable" role="status">
                {history.unavailableMessage}
              </p>
            ) : (
            <button
              className="ed-tutor-primary"
              disabled={busy || !history}
              onClick={startLearning}
              type="button"
            >
              {busy && pendingAction === "start"
                ? <LoaderCircle aria-hidden="true" className="ed-tutor-spin" size={17} />
                : <MessageCircle aria-hidden="true" size={17} />}
              {history?.activeSession ? "Continue Quiz" : "Start 10-Question Quiz"}
            </button>
            )}
            {error && <p className="ed-tutor-unavailable" role="alert">{error}</p>}
          </div>
        </>
      )}

      {history?.previousSessions?.length > 0 && !isOpen && (
        <div className="ed-tutor-history">
          <h3><BookOpen aria-hidden="true" size={16} /> Previous learning progress</h3>
          {history.previousSessions.slice(0, 3).map((item) => (
            <div className="ed-tutor-history-row" key={item.id}>
              <span>{new Date(item.completedAt ?? item.createdAt).toLocaleDateString()}</span>
              <span>Score: {item.correctCount}/{item.totalQuestions ?? 10} · {item.questionsAsked} answered</span>
              <span>{item.scorePercent}% accuracy</span>
            </div>
          ))}
        </div>
      )}

      {isOpen && session && (
        <>
          <div className="ed-tutor-progress">
            <div className="ed-tutor-progress-label">
              <span>Question {Math.min(questionsAnswered + (currentQuestion ? 1 : 0), session.totalQuestions)} of {session.totalQuestions}</span>
              <span>Score: {answeredCorrectly}/{questionsAnswered} · {accuracy}%</span>
            </div>
            <div
              aria-label={`Quiz progress ${questionsAnswered} of ${session.totalQuestions} questions answered`}
              aria-valuemax="100"
              aria-valuemin="0"
              aria-valuenow={Math.round((questionsAnswered / session.totalQuestions) * 100)}
              className="ed-tutor-progress-track"
              role="progressbar"
            >
              <span style={{ width: `${Math.round((questionsAnswered / session.totalQuestions) * 100)}%` }} />
            </div>
          </div>

          <div aria-live="polite" className="ed-tutor-conversation" ref={conversationRef}>
            {session.questions.map((question) => (
              <div className="ed-tutor-turn" key={question.id}>
                <div className="ed-tutor-bubble ed-tutor-bubble-ai">
                  <span className="ed-tutor-avatar"><Sparkles aria-hidden="true" size={14} /></span>
                  <div>
                    <p className="ed-tutor-message-label">QUESTION {session.questions.indexOf(question) + 1} · {difficultyLabels[question.difficulty]}</p>
                    <p>{question.question}</p>
                    {question.type === "mcq" && question.choices.length > 0 && (
                      <div className="ed-tutor-choices">
                        {question.choices.map((choice, index) => (
                          <button
                            aria-pressed={question.studentAnswer === choice}
                            className={question.answeredAt
                              ? question.isCorrect && choice === question.studentAnswer
                                ? "is-correct"
                                : !question.isCorrect && choice === question.studentAnswer
                                  ? "is-incorrect"
                                  : ""
                              : ""}
                            disabled={Boolean(question.answeredAt) || busy || session.status !== "active"}
                            key={`${question.id}-${choice}`}
                            onClick={() => chooseAnswer(choice)}
                            type="button"
                          >
                            <span>{String.fromCharCode(65 + index)}</span>{choice}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {question.studentAnswer && (
                  <div className="ed-tutor-bubble ed-tutor-bubble-student">
                    <span className="ed-tutor-avatar">YOU</span>
                    <p>{question.studentAnswer}</p>
                  </div>
                )}
                {question.answeredAt && (
                  <p className={`ed-tutor-feedback ${question.isCorrect ? "is-correct" : "is-incorrect"}`}>
                    {question.feedback}{question.explanation ? ` ${question.explanation}` : ""}
                  </p>
                )}
              </div>
            ))}
            {currentQuestion && (
              <div className="ed-tutor-question-panel" data-tutor-question ref={questionRef}>
                {busy && pendingAction === "answer" && (
                  <p role="status"><LoaderCircle aria-hidden="true" className="ed-tutor-spin" size={16} /> Checking your answer…</p>
                )}
              </div>
            )}
            {session.status === "completed" && (
              <div className="ed-tutor-question-panel" role="status">
                <h3>{questionsAnswered === session.totalQuestions ? "Quiz complete!" : "Quiz stopped"}</h3>
                <p className="ed-tutor-message-label">YOUR SCORE</p>
                <p>{answeredCorrectly} correct out of {session.totalQuestions}</p>
                <p>You answered {questionsAnswered} of {session.totalQuestions} questions · {accuracy}% accuracy</p>
              </div>
            )}
            {error && <p className="ed-tutor-error" role="alert">{error}</p>}
          </div>
          <div className="ed-tutor-footer">
            <span>10 multiple-choice questions about {session.topic}.</span>
            {session.status === "active" && (
              <button
                className="ed-tutor-end"
                disabled={busy}
                onClick={endSession}
                type="button"
              >
                {busy && pendingAction === "end"
                  ? <LoaderCircle aria-hidden="true" className="ed-tutor-spin" size={16} />
                  : <CircleStop aria-hidden="true" size={16} />}
                Stop and Show Score
              </button>
            )}
          </div>
        </>
      )}

      {!isOpen && error && <p className="ed-tutor-error" role="alert">{error}</p>}
    </section>
  );
}
