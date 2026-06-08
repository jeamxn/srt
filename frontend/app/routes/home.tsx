import { useEffect, useState } from "react";
import {
  Card,
  Input,
  Select,
  Button,
  Badge,
  Tag,
  DatePicker,
  Typography,
  Space,
  Alert,
  Empty,
  App as AntdApp,
} from "antd";
import {
  LoginOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  ThunderboltFilled,
} from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { api, type Train, type Job, type Credentials } from "~/api";

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
  "processing" | "success" | "error" | "default"
> = {
  PENDING: "processing",
  RESERVED: "success",
  FAILED: "error",
  CANCELLED: "default",
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
  const { message } = AntdApp.useApp();

  const [stations, setStations] = useState<string[]>([]);
  const [creds, setCreds] = useState<Credentials>({ srt_id: "", srt_pw: "" });
  const [loggedIn, setLoggedIn] = useState(false);

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

  // 검색/예약 가능 여부: 아이디·비번이 채워졌으면 됨 (로그인 확인은 권장이나 필수는 아님)
  const canQuery = creds.srt_id.trim() !== "" && creds.srt_pw.trim() !== "";

  async function handleLogin() {
    if (!canQuery) {
      message.warning("SRT 아이디와 비밀번호를 입력하세요.");
      return;
    }
    setLoginLoading(true);
    try {
      await api.loginCheck(creds);
      setLoggedIn(true);
      message.success("로그인 확인 완료. 열차를 검색하세요.");
      refreshJobs();
    } catch (e: any) {
      setLoggedIn(false);
      message.error(e.message);
    } finally {
      setLoginLoading(false);
    }
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

  async function handleCancel(id: number) {
    try {
      await api.cancelJob(id);
      await refreshJobs();
    } catch (e: any) {
      message.error(e.message);
    }
  }

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
              자리가 있으면 즉시 예약, 없으면 5초마다 자동 재시도합니다.
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
                확인됨
              </Tag>
            ) : null
          }
        >
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
                  아이디 (전화번호 / 이메일 / 회원번호)
                </Text>
                <Input
                  value={creds.srt_id}
                  onChange={(e) =>
                    setCreds((c) => ({ ...c, srt_id: e.target.value }))
                  }
                  placeholder="010-1234-5678"
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
              {loggedIn ? "재확인" : "로그인 확인"}
            </Button>
          </Space>
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
                * 위에서 SRT 아이디·비밀번호를 입력하면 검색할 수 있어요.
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
                        loading={reservingNo === t.train_number}
                        onClick={() => handleReserve(t)}
                      >
                        {anySeat ? "예약" : "자동 예약"}
                      </Button>
                    </div>
                  );
                })}
              </Space>
            )}
          </Card>
        )}

        {/* 4. 예약 현황 */}
        {jobs.length > 0 && (
          <Card title="4. 예약 현황">
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              {jobs.map((j) => (
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
                  {j.status === "PENDING" && (
                    <div style={{ marginTop: 8 }}>
                      <Button
                        size="small"
                        icon={<CloseOutlined />}
                        onClick={() => handleCancel(j.id)}
                      >
                        재시도 중단
                      </Button>
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
