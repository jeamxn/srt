import { useEffect, useState } from "react";
import { Loader2, Train as TrainIcon, AlertCircle, CheckCircle2, X } from "lucide-react";
import { api, type Train, type Job, type Credentials } from "~/api";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

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

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "success" | "warning"
> = {
  PENDING: "warning",
  RESERVED: "success",
  FAILED: "destructive",
  CANCELLED: "secondary",
};

export function meta() {
  return [
    { title: "SRT 자동 예약" },
    {
      name: "description",
      content: "SRT 기차표 자동 예약 (자리 없으면 5초마다 재시도)",
    },
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
  const [searching, setSearching] = useState(false);
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
    setSearching(true);
    setTrains([]);
    try {
      const d = await api.search(creds, { dep, arr, date, time });
      setTrains(d.trains);
      if (d.trains.length === 0) setInfo("검색된 열차가 없습니다.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSearching(false);
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
    <main className="dark min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-5 py-10 pb-24">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <TrainIcon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">SRT 자동 예약</h1>
            <p className="text-sm text-muted-foreground">
              자리가 있으면 즉시 예약, 없으면 5초마다 자동 재시도합니다.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-5 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {info && (
          <div className="mb-5 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{info}</span>
          </div>
        )}

        {/* 1. 로그인 */}
        <Card className="mb-5">
          <CardHeader>
            <CardTitle className="text-base">1. SRT 계정</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>아이디 (전화번호 / 이메일 / 회원번호)</Label>
                <Input
                  value={creds.srt_id}
                  onChange={(e) =>
                    setCreds({ ...creds, srt_id: e.target.value })
                  }
                  placeholder="010-1234-5678"
                />
              </div>
              <div className="space-y-2">
                <Label>비밀번호</Label>
                <Input
                  type="password"
                  value={creds.srt_pw}
                  onChange={(e) =>
                    setCreds({ ...creds, srt_pw: e.target.value })
                  }
                  placeholder="비밀번호"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={handleLogin} disabled={loading}>
                {loading && <Loader2 className="animate-spin" />}
                {loggedIn ? "재확인" : "로그인 확인"}
              </Button>
              {loggedIn && (
                <Badge variant="success">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  확인됨
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 2. 검색 */}
        <Card className="mb-5">
          <CardHeader>
            <CardTitle className="text-base">2. 열차 검색</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>출발역</Label>
                <Select value={dep} onValueChange={setDep}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {stations.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>도착역</Label>
                <Select value={arr} onValueChange={setArr}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {stations.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>날짜</Label>
                <Input
                  type="date"
                  value={fmtDate(date)}
                  onChange={(e) =>
                    setDate(e.target.value.replaceAll("-", ""))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>출발 시각 이후</Label>
                <Select value={time} onValueChange={setTime}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, h) => {
                      const v = String(h).padStart(2, "0") + "0000";
                      return (
                        <SelectItem key={v} value={v}>
                          {String(h).padStart(2, "0")}:00
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>좌석</Label>
                <Select value={seatType} onValueChange={setSeatType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEAT_TYPES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              onClick={handleSearch}
              disabled={searching || !creds.srt_id}
            >
              {searching && <Loader2 className="animate-spin" />}
              검색
            </Button>
          </CardContent>
        </Card>

        {/* 3. 검색 결과 */}
        {trains.length > 0 && (
          <Card className="mb-5">
            <CardHeader>
              <CardTitle className="text-base">3. 열차 선택 & 예약</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {trains.map((t) => {
                const general = t.general_available;
                const special = t.special_available;
                const anySeat = general || special;
                return (
                  <div
                    key={t.train_number}
                    className="flex items-center justify-between gap-4 rounded-lg border bg-secondary/30 px-4 py-3"
                  >
                    <div className="space-y-1">
                      <div className="text-base font-semibold">
                        {fmtTime(t.dep_time)} → {fmtTime(t.arr_time)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t.train_name} {t.train_number} · {t.dep_station_name}→
                        {t.arr_station_name}
                      </div>
                      <div className="flex gap-1.5 pt-0.5">
                        <Badge variant={general ? "success" : "secondary"}>
                          일반실 {t.general_seat_state}
                        </Badge>
                        <Badge variant={special ? "success" : "secondary"}>
                          특실 {t.special_seat_state}
                        </Badge>
                      </div>
                    </div>
                    <Button
                      variant={anySeat ? "default" : "outline"}
                      onClick={() => handleReserve(t)}
                      disabled={reservingNo === t.train_number}
                    >
                      {reservingNo === t.train_number && (
                        <Loader2 className="animate-spin" />
                      )}
                      {anySeat ? "예약" : "자동 예약"}
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* 4. 예약 현황 */}
        {jobs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">4. 예약 현황</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {jobs.map((j) => (
                <div
                  key={j.id}
                  className="rounded-lg border bg-secondary/30 px-4 py-3"
                >
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <strong className="text-sm">
                      {j.train_label ||
                        `${j.dep}→${j.arr} ${j.train_number}`}
                    </strong>
                    <Badge variant={STATUS_VARIANT[j.status] ?? "secondary"}>
                      {j.status === "PENDING" && (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      )}
                      {j.status_display}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {fmtDate(j.date)} · 시도 {j.attempts}회
                    {j.reservation_number &&
                      ` · 예약번호 ${j.reservation_number}`}
                  </div>
                  {j.last_message && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {j.last_message}
                    </div>
                  )}
                  {j.status === "PENDING" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => handleCancel(j.id)}
                    >
                      <X className="h-3 w-3" />
                      재시도 중단
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
