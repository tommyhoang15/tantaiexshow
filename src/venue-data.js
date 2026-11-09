// Dữ liệu sự kiện & khu khán giả. Sửa file này để đổi tên, giá, vị trí khu.
// Toạ độ tính bằng mét: x sang ngang, z từ sân khấu chính (z âm) ra phía sau (z dương).

// Nguồn: Ticketbox (giá lúc mở bán), Phụ Nữ Việt Nam (vị trí VVIP/President), SGGP, Znews (ngày, quy mô).
// Vị trí và kích thước các khu là ước lượng: BTC không công bố sơ đồ chi tiết.
export const EVENT = {
  title: 'Rap Việt All-Star Concert 2021',
  ledText: 'RAP VIỆT ALL-STAR',
  eyebrow: '10.04.2021 · SECC, Quận 7, TP.HCM',
  shows: [
    { id: 'n1', label: 'Thứ 7 · 10/4/2021' },
  ],
};

// Sân khấu chính và sân khấu phụ (Stage B) ở giữa khán đài
export const STAGES = {
  main: { x: 0, z: -34, w: 36, d: 12, h: 2.2 },
  runway: { x: 0, z: -14, w: 4, d: 28, h: 1.4 },
  b: { x: 0, z: 2, r: 4.5, h: 1.4 },
};

// kind: 'stand' = khu đứng, 'seat' = khu ngồi, 'vip' = khu VIP
// rect: tâm (x, z), rộng w, sâu d · lift: độ cao sàn (khán đài nâng)
export const ZONES = [
  { id: 'v1l', name: 'VIP 1 Trái', kind: 'stand', price: 1800000, color: '#ff5d73', rect: { x: -11, z: -21, w: 14, d: 12 } },
  { id: 'v1r', name: 'VIP 1 Phải', kind: 'stand', price: 1800000, color: '#ff5d73', rect: { x: 11, z: -21, w: 14, d: 12 } },
  { id: 'v2l', name: 'VIP 2 Trái', kind: 'stand', price: 1500000, color: '#ff9f43', rect: { x: -12, z: -5, w: 16, d: 14 } },
  { id: 'v2r', name: 'VIP 2 Phải', kind: 'stand', price: 1500000, color: '#ff9f43', rect: { x: 12, z: -5, w: 16, d: 14 } },
  { id: 'ga1l', name: 'GA 1 Trái', kind: 'stand', price: 750000, color: '#feca57', rect: { x: -11, z: 14, w: 22, d: 12 } },
  { id: 'ga1r', name: 'GA 1 Phải', kind: 'stand', price: 750000, color: '#feca57', rect: { x: 11, z: 14, w: 22, d: 12 } },
  { id: 'ga2', name: 'GA 2', kind: 'stand', price: 550000, color: '#1dd1a1', rect: { x: 0, z: 29, w: 50, d: 12 } },
  { id: 'prl', name: 'President Trái', kind: 'vip', price: 35000000, color: '#ffd166', rect: { x: -27, z: -24, w: 9, d: 10 }, lift: 1.4 },
  { id: 'prr', name: 'President Phải', kind: 'vip', price: 35000000, color: '#ffd166', rect: { x: 27, z: -24, w: 9, d: 10 }, lift: 1.4 },
  { id: 'vvl', name: 'VVIP Trái', kind: 'vip', price: 7000000, color: '#a66cff', rect: { x: -28, z: -6, w: 10, d: 20 }, lift: 1.2 },
  { id: 'vvr', name: 'VVIP Phải', kind: 'vip', price: 7000000, color: '#a66cff', rect: { x: 28, z: -6, w: 10, d: 20 }, lift: 1.2 },
];

export const KIND_LABEL = { stand: 'Khu đứng', seat: 'Khu ngồi', vip: 'Khu VIP' };

export const DANCES = [
  { id: 'idle', label: 'Đứng yên' },
  { id: 'bounce', label: 'Nhún' },
  { id: 'wave', label: 'Vẫy tay' },
  { id: 'spin', label: 'Xoay' },
  { id: 'jump', label: 'Nhảy' },
];

// Video phát trực tiếp trên màn LED chính và 2 màn IMAG hai bên (YouTube embed chính thức)
export const VIDEO = {
  id: 'ivZj4iHtjWI', // Rap Việt [Live Stage] – Vie Channel
  start: 0,
};
