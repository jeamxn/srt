import { useEffect, useState } from "react";
import {
  Card,
  Input,
  InputNumber,
  Select,
  Button,
  Badge,
  Tag,
  DatePicker,
  Typography,
  Space,
  Alert,
  Empty,
  Popconfirm,
  App as AntdApp,
} from "antd";
import {
  LoginOutlined,
  LogoutOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  ThunderboltFilled,
  PauseOutlined,
  CaretRightOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import {
  api,
  getToken,
  getUserId,
  setAuth,
  clearAuth,
  type Train,
  type Job,
  type Credentials,
} from "~/api";

const { Title, Text } = Typography;

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

const STATUS_BADGE: Record<
  string,
  "processing" | "success" | "error" | "default" | "warning"
> = {
  QUEUED: "default",
  PENDING: "processing",
  PAUSED: "warning",
  RESERVED: "success",
  FAILED: "error",
  CANCELLED: "default",
};

// 재시도 간격 단위 변환
const UNIT_FACTOR: Record<string, number> = { ms: 1, s: 1000, min: 60000 };

function msToUnit(ms: number): { value: number; unit: string } {
  if (ms % 60000 === 0 && ms >= 60000) return { value: ms / 60000, unit: "min" };
  if (ms % 1000 === 0 && ms >= 1000) return { value: ms / 1000, unit: "s" };
  return { value: ms, unit: "ms" };
}

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
  const { message } = AntdApp.useApp();

  const [stations, setStations] = useState<string[]>([]);
  const [creds, setCreds] = useState<Credentials>({ srt_id: "", srt_pw: "" });
  const [loggedIn, setLoggedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [dep, setDep] = useState("수서");
  const [arr, setArr] = useState("부산");
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [time, setTime] = useState("000000");
  const [seatType, setSeatType] = useState("GENERAL_FIRST");

  const [trains, setTrains] = useState<Train[]>([]);
  const [searched, setSearched] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [reservingNo, setReservingNo] = useState<string | null>(null);

  const [jobs, setJobs] = useState<Job[]>([]);
  // 잡별 재시도 간격 편집 상태 (value + unit)
  const [intervals, setIntervals] = useState<
    Record<number, { value: number; unit: string }>
  >({});
  const [startingId, setStartingId] = useState<number | null>(null);
  // 전체 시간 설정용 (헤더)
  const [bulkInterval, setBulkInterval] = useState<{ value: number; unit: string }>({
    value: 5,
    unit: "s",
  });
  const [bulkBusy, setBulkBusy] = useState(false);

  function intervalFor(j: Job) {
    return intervals[j.id] ?? msToUnit(j.retry_interval_ms);
  }

  function setIntervalValue(id: number, value: number) {
    setIntervals((m) => ({
      ...m,
      [id]: { value, unit: m[id]?.unit ?? "s" },
    }));
  }

  function setIntervalUnit(id: number, unit: string, current: number) {
    setIntervals((m) => ({
      ...m,
      [id]: { value: m[id]?.value ?? current, unit },
    }));
  }

  useEffect(() => {
    api
      .stations()
      .then((d) => setStations(d.stations))
      .catch(() => {});
  }, []);

  // 저장된 토큰이 있으면 로그인 상태 복원 + 작업 조회
  useEffect(() => {
    const t = getToken();
    const uid = getUserId();
    if (t && uid) {
      setLoggedIn(true);
      setUserId(uid);
      setCreds((c) => ({ ...c, srt_id: uid }));
      refreshJobs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    const hasPending = jobs.some((j) => j.status === "PENDING");
    if (!hasPending) return;
    const t = setInterval(refreshJobs, 3000);
    return () => clearInterval(t);
  }, [jobs, loggedIn]);

  async function refreshJobs() {
    if (!getToken()) return;
    try {
      const d = await api.jobs();
      setJobs(d.jobs);
    } catch {
      /* ignore */
    }
  }

  // 검색/예약: 로그인(토큰)된 상태에서만 가능
  const canQuery =
    loggedIn && creds.srt_id.trim() !== "" && creds.srt_pw.trim() !== "";

  async function handleLogin() {
    if (creds.srt_id.trim() === "" || creds.srt_pw.trim() === "") {
      message.warning("회원번호와 비밀번호를 입력하세요.");
      return;
    }
    setLoginLoading(true);
    try {
      const res = await api.loginCheck(creds);
      setAuth(res.token, res.user_id);
      setLoggedIn(true);
      setUserId(res.user_id);
      message.success(`로그인 완료 (회원번호 ${res.user_id}). 열차를 검색하세요.`);
      refreshJobs();
    } catch (e: any) {
      clearAuth();
      setLoggedIn(false);
      setUserId(null);
      message.error(e.message);
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLogout() {
    clearAuth();
    setLoggedIn(false);
    setUserId(null);
    setJobs([]);
    setTrains([]);
    setSearched(false);
    setCreds((c) => ({ ...c, srt_pw: "" }));
    message.success("로그아웃했습니다.");
  }

  async function handleSearch() {
    if (!canQuery) {
      message.warning("먼저 SRT 아이디와 비밀번호를 입력하세요.");
      return;
    }
    setSearching(true);
    setTrains([]);
    setSearched(false);
    try {
      const d = await api.search(creds, {
        dep,
        arr,
        date: date.format("YYYYMMDD"),
        time,
      });
      setTrains(d.trains);
      setSearched(true);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setSearching(false);
    }
  }

  async function handleReserve(t: Train) {
    setReservingNo(t.train_number);
    try {
      const label = `${t.train_name} ${t.train_number} ${fmtTime(
        t.dep_time
      )}~${fmtTime(t.arr_time)} ${t.dep_station_name}→${t.arr_station_name}`;
      const res = await api.reserve({
        ...creds,
        dep,
        arr,
        date: date.format("YYYYMMDD"),
        time,
        train_number: t.train_number,
        train_label: label,
        seat_type: seatType,
      });
      message.success(res.message);
      await refreshJobs();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setReservingNo(null);
    }
  }

  async function handleStart(j: Job) {
    const iv = intervalFor(j);
    const ms = Math.round(iv.value * (UNIT_FACTOR[iv.unit] ?? 1000));
    if (!ms || ms < 100) {
      message.warning("재시도 간격은 최소 100ms 이상이어야 합니다.");
      return;
    }
    setStartingId(j.id);
    try {
      await api.startJob(j.id, ms);
      message.success("자동 예약을 시작했습니다.");
      await refreshJobs();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setStartingId(null);
    }
  }

  async function handleCancel(id: number) {
    try {
      await api.cancelJob(id);
      message.success("재시도를 완전히 중단했습니다.");
      await refreshJobs();
    } catch (e: any) {
      message.error(e.message);
    }
  }

  async function handlePause(id: number) {
    try {
      await api.pauseJob(id);
      message.info("일시중지했습니다. 재개하면 이어서 재시도합니다.");
      await refreshJobs();
    } catch (e: any) {
      message.error(e.message);
    }
  }

  async function handleResume(j: Job) {
    const iv = intervalFor(j);
    const ms = Math.round(iv.value * (UNIT_FACTOR[iv.unit] ?? 1000));
    if (!ms || ms < 100) {
      message.warning("재시도 간격은 최소 100ms 이상이어야 합니다.");
      return;
    }
    try {
      await api.resumeJob(j.id, ms);
      message.success("재개했습니다.");
      await refreshJobs();
    } catch (e: any) {
      message.error(e.message);
    }
  }

  async function handlePauseAll() {
    setBulkBusy(true);
    try {
      const d = await api.pauseAll();
      message.info(`${d.affected}건 일시중지했습니다.`);
      setJobs(d.jobs);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleResumeAll() {
    setBulkBusy(true);
    try {
      const d = await api.resumeAll();
      message.success(`${d.affected}건 재시도를 시작했습니다.`);
      setJobs(d.jobs);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleSetIntervalAll() {
    const ms = Math.round(
      bulkInterval.value * (UNIT_FACTOR[bulkInterval.unit] ?? 1000)
    );
    if (!ms || ms < 100) {
      message.warning("재시도 간격은 최소 100ms 이상이어야 합니다.");
      return;
    }
    setBulkBusy(true);
    try {
      const d = await api.setIntervalAll(ms);
      message.success(`${d.affected}건 간격을 적용했습니다.`);
      setIntervals({});
      setJobs(d.jobs);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setBulkBusy(false);
    }
  }

  // 활성(끝나지 않은) 작업이 하나라도 있는지
  const hasActive = jobs.some(
    (j) => j.status === "QUEUED" || j.status === "PENDING" || j.status === "PAUSED"
  );
  const activeJobs = jobs.filter(
    (j) => j.status === "QUEUED" || j.status === "PENDING" || j.status === "PAUSED"
  );
  const doneJobs = jobs.filter(
    (j) =>
      j.status === "RESERVED" || j.status === "FAILED" || j.status === "CANCELLED"
  );

  const stationOptions = stations.map((s) => ({ value: s, label: s }));
  const timeOptions = Array.from({ length: 24 }, (_, h) => ({
    value: String(h).padStart(2, "0") + "0000",
    label: `${String(h).padStart(2, "0")}:00`,
  }));

  return (
    <main style={{ minHeight: "100vh", padding: "40px 20px 96px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <Space align="center" size={12} style={{ marginBottom: 28 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "#3a6bff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              color: "#fff",
            }}
          >
            <ThunderboltFilled />
          </div>
          <div>
            <Title level={3} style={{ margin: 0 }}>
              SRT 자동 예약
            </Title>
            <Text type="secondary">
              열차를 대기열에 담고, 예약 현황에서 간격을 정해 자동 예약을 시작하세요.
            </Text>
          </div>
        </Space>

        {/* 1. 로그인 */}
        <Card
          title="1. SRT 계정"
          style={{ marginBottom: 20 }}
          extra={
            loggedIn ? (
              <Tag icon={<CheckCircleOutlined />} color="success">
                회원번호 {userId}
              </Tag>
            ) : null
          }
        >
          {loggedIn ? (
            <Space
              direction="vertical"
              size={12}
              style={{ width: "100%" }}
            >
              <Text type="secondary" style={{ fontSize: 13 }}>
                회원번호 <strong>{userId}</strong> 로 로그인되어 있습니다. 아래
                예약 현황에는 이 계정의 작업만 표시됩니다.
              </Text>
              <Button
                icon={<LogoutOutlined />}
                onClick={handleLogout}
                danger
              >
                로그아웃
              </Button>
            </Space>
          ) : (
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <div
                style={{
                  display: "grid",
                  gap: 16,
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                }}
              >
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    SRT 회원번호 (숫자)
                  </Text>
                  <Input
                    value={creds.srt_id}
                    onChange={(e) =>
                      setCreds((c) => ({ ...c, srt_id: e.target.value }))
                    }
                    placeholder="예: 2288275161"
                    size="large"
                    style={{ marginTop: 6 }}
                  />
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    비밀번호
                  </Text>
                  <Input.Password
                    value={creds.srt_pw}
                    onChange={(e) =>
                      setCreds((c) => ({ ...c, srt_pw: e.target.value }))
                    }
                    placeholder="비밀번호"
                    size="large"
                    style={{ marginTop: 6 }}
                    onPressEnter={handleLogin}
                  />
                </div>
              </div>
              <Button
                type="primary"
                icon={<LoginOutlined />}
                loading={loginLoading}
                onClick={handleLogin}
              >
                로그인
              </Button>
            </Space>
          )}
        </Card>

        {/* 2. 검색 */}
        <Card title="2. 열차 검색" style={{ marginBottom: 20 }}>
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <div
              style={{
                display: "grid",
                gap: 16,
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              }}
            >
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  출발역
                </Text>
                <Select
                  value={dep}
                  onChange={setDep}
                  options={stationOptions}
                  showSearch
                  size="large"
                  style={{ width: "100%", marginTop: 6 }}
                />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  도착역
                </Text>
                <Select
                  value={arr}
                  onChange={setArr}
                  options={stationOptions}
                  showSearch
                  size="large"
                  style={{ width: "100%", marginTop: 6 }}
                />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  날짜
                </Text>
                <DatePicker
                  value={date}
                  onChange={(d) => d && setDate(d)}
                  allowClear={false}
                  size="large"
                  style={{ width: "100%", marginTop: 6 }}
                  disabledDate={(d) => d && d < dayjs().startOf("day")}
                />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  출발 시각 이후
                </Text>
                <Select
                  value={time}
                  onChange={setTime}
                  options={timeOptions}
                  size="large"
                  style={{ width: "100%", marginTop: 6 }}
                />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  좌석
                </Text>
                <Select
                  value={seatType}
                  onChange={setSeatType}
                  options={SEAT_TYPES}
                  size="large"
                  style={{ width: "100%", marginTop: 6 }}
                />
              </div>
            </div>
            <Button
              type="primary"
              icon={<SearchOutlined />}
              loading={searching}
              disabled={!canQuery}
              onClick={handleSearch}
            >
              검색
            </Button>
            {!canQuery && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                * 위에서 SRT 회원번호로 먼저 로그인하면 검색할 수 있어요.
              </Text>
            )}
          </Space>
        </Card>

        {/* 3. 검색 결과 */}
        {searched && (
          <Card title="3. 열차 선택 & 예약" style={{ marginBottom: 20 }}>
            {trains.length === 0 ? (
              <Empty description="검색된 열차가 없습니다." />
            ) : (
              <Space direction="vertical" size={12} style={{ width: "100%" }}>
                {trains.map((t) => {
                  const general = t.general_available;
                  const special = t.special_available;
                  const anySeat = general || special;
                  return (
                    <div
                      key={t.train_number}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 16,
                        border: "1px solid #303030",
                        borderRadius: 10,
                        padding: "12px 16px",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 600 }}>
                          {fmtTime(t.dep_time)} → {fmtTime(t.arr_time)}
                        </div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {t.train_name} {t.train_number} · {t.dep_station_name}
                          →{t.arr_station_name}
                        </Text>
                        <div style={{ marginTop: 6 }}>
                          <Space size={6}>
                            <Tag color={general ? "success" : "default"}>
                              일반실 {t.general_seat_state}
                            </Tag>
                            <Tag color={special ? "success" : "default"}>
                              특실 {t.special_seat_state}
                            </Tag>
                          </Space>
                        </div>
                      </div>
                      <Button
                        type={anySeat ? "primary" : "default"}
                        icon={<PlusOutlined />}
                        loading={reservingNo === t.train_number}
                        onClick={() => handleReserve(t)}
                      >
                        대기열 추가
                      </Button>
                    </div>
                  );
                })}
              </Space>
            )}
          </Card>
        )}

        {/* 4. 예약 현황 (진행중) */}
        {activeJobs.length > 0 && (
          <Card
            title="4. 진행중인 예약"
            extra={
              hasActive ? (
                <Space size={8} wrap>
                  <Space.Compact>
                    <InputNumber
                      size="small"
                      min={1}
                      value={bulkInterval.value}
                      onChange={(v) =>
                        setBulkInterval((s) => ({ ...s, value: Number(v) || 0 }))
                      }
                      style={{ width: 80 }}
                    />
                    <Select
                      size="small"
                      value={bulkInterval.unit}
                      onChange={(u) => setBulkInterval((s) => ({ ...s, unit: u }))}
                      options={[
                        { value: "ms", label: "ms" },
                        { value: "s", label: "초" },
                        { value: "min", label: "분" },
                      ]}
                      style={{ width: 64 }}
                    />
                  </Space.Compact>
                  <Button
                    size="small"
                    loading={bulkBusy}
                    onClick={handleSetIntervalAll}
                  >
                    전체 시간 적용
                  </Button>
                  <Button
                    size="small"
                    icon={<PauseOutlined />}
                    loading={bulkBusy}
                    onClick={handlePauseAll}
                  >
                    전체 일시중지
                  </Button>
                  <Button
                    size="small"
                    type="primary"
                    icon={<CaretRightOutlined />}
                    loading={bulkBusy}
                    onClick={handleResumeAll}
                  >
                    전체 시작/재개
                  </Button>
                </Space>
              ) : null
            }
          >
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              {activeJobs.map((j) => (
                <div
                  key={j.id}
                  style={{
                    border: "1px solid #303030",
                    borderRadius: 10,
                    padding: "12px 16px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      marginBottom: 4,
                    }}
                  >
                    <strong style={{ fontSize: 14 }}>
                      {j.train_label || `${j.dep}→${j.arr} ${j.train_number}`}
                    </strong>
                    <Badge
                      status={STATUS_BADGE[j.status] ?? "default"}
                      text={j.status_display}
                    />
                  </div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {fmtDate(j.date)} · 시도 {j.attempts}회
                    {j.reservation_number &&
                      ` · 예약번호 ${j.reservation_number}`}
                  </Text>
                  {j.last_message && (
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {j.last_message}
                      </Text>
                    </div>
                  )}
                  {j.status === "QUEUED" && (
                    <div style={{ marginTop: 10 }}>
                      <Space size={8} wrap>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          재시도 간격
                        </Text>
                        <Space.Compact>
                          <InputNumber
                            size="small"
                            min={1}
                            value={intervalFor(j).value}
                            onChange={(v) =>
                              setIntervalValue(j.id, Number(v) || 0)
                            }
                            style={{ width: 90 }}
                          />
                          <Select
                            size="small"
                            value={intervalFor(j).unit}
                            onChange={(u) =>
                              setIntervalUnit(j.id, u, intervalFor(j).value)
                            }
                            options={[
                              { value: "ms", label: "ms" },
                              { value: "s", label: "초" },
                              { value: "min", label: "분" },
                            ]}
                            style={{ width: 70 }}
                          />
                        </Space.Compact>
                        <Button
                          size="small"
                          type="primary"
                          icon={<CaretRightOutlined />}
                          loading={startingId === j.id}
                          onClick={() => handleStart(j)}
                        >
                          시작
                        </Button>
                        <Popconfirm
                          title="이 작업을 삭제할까요?"
                          okText="삭제"
                          cancelText="취소"
                          okButtonProps={{ danger: true }}
                          onConfirm={() => handleCancel(j.id)}
                        >
                          <Button size="small" danger icon={<CloseOutlined />}>
                            삭제
                          </Button>
                        </Popconfirm>
                      </Space>
                    </div>
                  )}
                  {j.status === "PENDING" && (
                    <div style={{ marginTop: 8 }}>
                      <Space size={8} wrap>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          간격 {msToUnit(j.retry_interval_ms).value}
                          {msToUnit(j.retry_interval_ms).unit}
                        </Text>
                        <Button
                          size="small"
                          icon={<PauseOutlined />}
                          onClick={() => handlePause(j.id)}
                        >
                          일시중지
                        </Button>
                        <Popconfirm
                          title="재시도를 완전히 중단할까요?"
                          description="중단하면 이 예약 작업은 다시 시작할 수 없습니다."
                          okText="중단"
                          cancelText="취소"
                          okButtonProps={{ danger: true }}
                          onConfirm={() => handleCancel(j.id)}
                        >
                          <Button size="small" danger icon={<CloseOutlined />}>
                            재시도 중단
                          </Button>
                        </Popconfirm>
                      </Space>
                    </div>
                  )}
                  {j.status === "PAUSED" && (
                    <div style={{ marginTop: 8 }}>
                      <Space size={8} wrap>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          재시도 간격
                        </Text>
                        <Space.Compact>
                          <InputNumber
                            size="small"
                            min={1}
                            value={intervalFor(j).value}
                            onChange={(v) =>
                              setIntervalValue(j.id, Number(v) || 0)
                            }
                            style={{ width: 90 }}
                          />
                          <Select
                            size="small"
                            value={intervalFor(j).unit}
                            onChange={(u) =>
                              setIntervalUnit(j.id, u, intervalFor(j).value)
                            }
                            options={[
                              { value: "ms", label: "ms" },
                              { value: "s", label: "초" },
                              { value: "min", label: "분" },
                            ]}
                            style={{ width: 70 }}
                          />
                        </Space.Compact>
                        <Button
                          size="small"
                          type="primary"
                          icon={<CaretRightOutlined />}
                          onClick={() => handleResume(j)}
                        >
                          재개
                        </Button>
                        <Popconfirm
                          title="재시도를 완전히 중단할까요?"
                          description="중단하면 이 예약 작업은 다시 시작할 수 없습니다."
                          okText="중단"
                          cancelText="취소"
                          okButtonProps={{ danger: true }}
                          onConfirm={() => handleCancel(j.id)}
                        >
                          <Button size="small" danger icon={<CloseOutlined />}>
                            재시도 중단
                          </Button>
                        </Popconfirm>
                      </Space>
                    </div>
                  )}
                </div>
              ))}
            </Space>
          </Card>
        )}

        {/* 5. 완료/종료된 예약 */}
        {doneJobs.length > 0 && (
          <Card title="5. 완료 / 종료" style={{ marginTop: 20 }}>
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              {doneJobs.map((j) => (
                <div
                  key={j.id}
                  style={{
                    border: "1px solid #303030",
                    borderRadius: 10,
                    padding: "12px 16px",
                    opacity: j.status === "RESERVED" ? 1 : 0.7,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      marginBottom: 4,
                    }}
                  >
                    <strong style={{ fontSize: 14 }}>
                      {j.train_label || `${j.dep}→${j.arr} ${j.train_number}`}
                    </strong>
                    <Badge
                      status={STATUS_BADGE[j.status] ?? "default"}
                      text={j.status_display}
                    />
                  </div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {fmtDate(j.date)} · 시도 {j.attempts}회
                    {j.reservation_number &&
                      ` · 예약번호 ${j.reservation_number}`}
                  </Text>
                  {j.last_message && (
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {j.last_message}
                      </Text>
                    </div>
                  )}
                </div>
              ))}
            </Space>
          </Card>
        )}
      </div>
    </main>
  );
}
