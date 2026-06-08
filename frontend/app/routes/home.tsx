import { useEffect, useState } from "react";
import { api, type Train, type Job, type Credentials } from "~/api";

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function fmtDate(yyyymmdd: string) {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function fmtTime(hhmmss: string) {
  if (hhmmss.length < 4) return hhmmss;
  return `${hhmmss.slice(0, 2)}:${hhmmss.slice(2, 4)}`;
}

const SEAT_TYPES = [
  { value: "GENERAL_FIRST", label: "일반실 우선" },
  { value: "GENERAL_ONLY", label: "일반실만" },
  { value: "SPECIAL_FIRST", label: "특실 우선" },
  { value: "SPECIAL_ONLY", label: "특실만" },
];

export function meta() {
  return [
    { title: "SRT 자동 예약" },
    { name: "description", content: "SRT 기차표 자동 예약 (자리 없으면 5초마다 재시도)" },
  ];
}

export default function Home() {
  const [stations, setStations] = useState<string[]>([]);
  const [creds, setCreds] = useState<Credentials>({ srt_id: "", srt_pw: "" });
  const [loggedIn, setLoggedIn] = useState(false);

  const [dep, setDep] = useState("수서");
  const [arr, setArr] = useState("부산");
  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState("000000");
  const [seatType, setSeatType] = useState("GENERAL_FIRST");

  const [trains, setTrains] = useState<Train[]>([]);
  const [loading, setLoading] = useState(false);
  const [reservingNo, setReservingNo] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    api
      .stations()
      .then((d) => setStations(d.stations))
      .catch(() => {});
  }, []);

  // 진행중 작업이 있으면 3초마다 폴링
  useEffect(() => {
    const hasPending = jobs.some((j) => j.status === "PENDING");
    if (!hasPending) return;
    const t = setInterval(refreshJobs, 3000);
    return () => clearInterval(t);
  }, [jobs]);

  async function refreshJobs() {
    try {
      const d = await api.jobs();
      setJobs(d.jobs);
    } catch {
      /* ignore */
    }
  }

  async function handleLogin() {
    setError("");
    setInfo("");
    if (!creds.srt_id || !creds.srt_pw) {
      setError("SRT 아이디와 비밀번호를 입력하세요.");
      return;
    }
    setLoading(true);
    try {
      await api.loginCheck(creds);
      setLoggedIn(true);
      setInfo("로그인 확인 완료. 열차를 검색하세요.");
      refreshJobs();
    } catch (e: any) {
      setError(e.message);
      setLoggedIn(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch() {
    setError("");
    setInfo("");
    setLoading(true);
    setTrains([]);
    try {
      const d = await api.search(creds, { dep, arr, date, time });
      setTrains(d.trains);
      if (d.trains.length === 0) setInfo("검색된 열차가 없습니다.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleReserve(t: Train) {
    setError("");
    setInfo("");
    setReservingNo(t.train_number);
    try {
      const label = `${t.train_name} ${t.train_number} ${fmtTime(
        t.dep_time
      )}~${fmtTime(t.arr_time)} ${t.dep_station_name}→${t.arr_station_name}`;
      const res = await api.reserve({
        ...creds,
        dep,
        arr,
        date,
        time,
        train_number: t.train_number,
        train_label: label,
        seat_type: seatType,
      });
      setInfo(res.message);
      await refreshJobs();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setReservingNo(null);
    }
  }

  async function handleCancel(id: number) {
    try {
      await api.cancelJob(id);
      await refreshJobs();
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <main className="container">
      <h1 className="title">SRT 자동 예약</h1>
      <p className="subtitle">
        자리가 있으면 즉시 예약하고, 없으면 5초마다 자동으로 재시도합니다.
      </p>

      {error && <div className="msg error">{error}</div>}
      {info && <div className="msg info">{info}</div>}

      {/* 로그인 */}
      <section className="card">
        <h2>1. SRT 계정</h2>
        <div className="row">
          <div className="field">
            <label>아이디 (전화번호 / 이메일 / 회원번호)</label>
            <input
              value={creds.srt_id}
              onChange={(e) =>
                setCreds({ ...creds, srt_id: e.target.value })
              }
              placeholder="010-1234-5678"
            />
          </div>
          <div className="field">
            <label>비밀번호</label>
            <input
              type="password"
              value={creds.srt_pw}
              onChange={(e) =>
                setCreds({ ...creds, srt_pw: e.target.value })
              }
              placeholder="비밀번호"
            />
          </div>
          <div className="field" style={{ flex: "0 0 auto", justifyContent: "flex-end" }}>
            <label>&nbsp;</label>
            <button onClick={handleLogin} disabled={loading}>
              {loading ? <span className="spin" /> : null}
              {loggedIn ? "재확인" : "로그인 확인"}
            </button>
          </div>
        </div>
      </section>

      {/* 검색 */}
      <section className="card">
        <h2>2. 열차 검색</h2>
        <div className="row">
          <div className="field">
            <label>출발역</label>
            <select value={dep} onChange={(e) => setDep(e.target.value)}>
              {stations.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>도착역</label>
            <select value={arr} onChange={(e) => setArr(e.target.value)}>
              {stations.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>날짜</label>
            <input
              type="date"
              value={fmtDate(date)}
              onChange={(e) => setDate(e.target.value.replaceAll("-", ""))}
            />
          </div>
          <div className="field">
            <label>출발 시각 이후</label>
            <select value={time} onChange={(e) => setTime(e.target.value)}>
              {Array.from({ length: 24 }, (_, h) => {
                const v = String(h).padStart(2, "0") + "0000";
                return (
                  <option key={v} value={v}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                );
              })}
            </select>
          </div>
          <div className="field">
            <label>좌석</label>
            <select value={seatType} onChange={(e) => setSeatType(e.target.value)}>
              {SEAT_TYPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <button onClick={handleSearch} disabled={loading || !creds.srt_id}>
            {loading ? <span className="spin" /> : null}
            검색
          </button>
        </div>
      </section>

      {/* 검색 결과 */}
      {trains.length > 0 && (
        <section className="card">
          <h2>3. 열차 선택 &amp; 예약</h2>
          <div className="train-list">
            {trains.map((t) => {
              const general = t.general_available;
              const special = t.special_available;
              const anySeat = general || special;
              return (
                <div className="train" key={t.train_number}>
                  <div className="train-info">
                    <span className="train-time">
                      {fmtTime(t.dep_time)} → {fmtTime(t.arr_time)}
                    </span>
                    <span className="train-meta">
                      {t.train_name} {t.train_number} · {t.dep_station_name}→
                      {t.arr_station_name}
                    </span>
                    <div className="badges">
                      <span className={`badge ${general ? "ok" : "no"}`}>
                        일반실 {t.general_seat_state}
                      </span>
                      <span className={`badge ${special ? "ok" : "no"}`}>
                        특실 {t.special_seat_state}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleReserve(t)}
                    disabled={reservingNo === t.train_number}
                  >
                    {reservingNo === t.train_number ? (
                      <span className="spin" />
                    ) : null}
                    {anySeat ? "예약" : "자동 예약 (재시도)"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 예약 작업 현황 */}
      {jobs.length > 0 && (
        <section className="card">
          <h2>4. 예약 현황</h2>
          {jobs.map((j) => (
            <div className="job" key={j.id}>
              <div className="job-head">
                <strong>{j.train_label || `${j.dep}→${j.arr} ${j.train_number}`}</strong>
                <span className={`status-tag status-${j.status}`}>
                  {j.status === "PENDING" ? <span className="spin" /> : null}
                  {j.status_display}
                </span>
              </div>
              <div className="job-meta">
                {fmtDate(j.date)} · 시도 {j.attempts}회
                {j.reservation_number && ` · 예약번호 ${j.reservation_number}`}
              </div>
              {j.last_message && (
                <div className="job-meta" style={{ marginTop: 4 }}>
                  {j.last_message}
                </div>
              )}
              {j.status === "PENDING" && (
                <div style={{ marginTop: 8 }}>
                  <button className="ghost" onClick={() => handleCancel(j.id)}>
                    재시도 중단
                  </button>
                </div>
              )}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
