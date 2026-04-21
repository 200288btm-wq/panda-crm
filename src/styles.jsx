export const T = {
  cream: '#F0EDD8',
  green: '#7BAF8E',
  greenDark: '#5a9070',
  greenLight: '#a8cfb8',
  orange: '#F2A65A',
  ink: '#1A1A1A',
  muted: '#6b7280',
  white: '#FFFFFF',
  red: '#e05a5a',
  redLight: '#fde8e8',
  greenBg: '#e8f4ed',
  card: '#FAFAF5',
  border: '#e5e0c8',
}

export function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&family=Nunito+Sans:wght@400;500;600;700&display=swap');
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      html, body, #root { height: 100%; }
      body { font-family: 'Nunito Sans', sans-serif; background: ${T.cream}; color: ${T.ink}; -webkit-font-smoothing: antialiased; }
      ::-webkit-scrollbar { width: 5px; height: 5px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: ${T.greenLight}; border-radius: 10px; }

      /* Layout */
      .app { display: flex; height: 100vh; overflow: hidden; }
      .sidebar { width: 230px; min-width: 230px; background: ${T.white}; border-right: 1px solid ${T.border}; display: flex; flex-direction: column; overflow-y: auto; z-index: 100; }
      .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
      .topbar { background: ${T.white}; border-bottom: 1px solid ${T.border}; padding: 0 24px; height: 56px; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
      .content { flex: 1; overflow-y: auto; padding: 22px 24px; }

      /* Sidebar */
      .sidebar-logo { padding: 18px 18px 12px; border-bottom: 1px solid ${T.border}; }
      .logo-paw { font-size: 24px; margin-bottom: 2px; }
      .logo-name { font-family: 'Nunito', sans-serif; font-weight: 900; font-size: 16px; color: ${T.ink}; }
      .logo-sub { font-size: 10px; color: ${T.muted}; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
      .nav-section { padding: 10px 0 2px; }
      .nav-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${T.muted}; padding: 0 18px 5px; }
      .nav-item { display: flex; align-items: center; gap: 9px; padding: 8px 18px; cursor: pointer; font-size: 13px; font-weight: 600; color: ${T.muted}; transition: all 0.12s; position: relative; }
      .nav-item:hover { background: ${T.cream}; color: ${T.ink}; }
      .nav-item.active { background: ${T.greenBg}; color: ${T.greenDark}; }
      .nav-item.active::before { content: ''; position: absolute; left: 0; top: 5px; bottom: 5px; width: 3px; background: ${T.green}; border-radius: 0 3px 3px 0; }
      .nav-icon { width: 18px; text-align: center; font-size: 14px; }
      .nav-badge { margin-left: auto; background: ${T.orange}; color: white; border-radius: 99px; font-size: 10px; font-weight: 700; padding: 1px 7px; }
      .sidebar-user { margin-top: auto; padding: 14px 18px; border-top: 1px solid ${T.border}; display: flex; align-items: center; gap: 9px; cursor: pointer; }
      .sidebar-user:hover { background: ${T.cream}; }
      .user-name { font-weight: 700; font-size: 13px; line-height: 1.2; }
      .user-role { font-size: 11px; color: ${T.muted}; }

      /* Topbar */
      .page-title { font-family: 'Nunito', sans-serif; font-weight: 800; font-size: 19px; }
      .topbar-right { display: flex; align-items: center; gap: 12px; }

      /* Buttons */
      .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 12px; font-family: 'Nunito', sans-serif; font-weight: 700; font-size: 13px; cursor: pointer; border: none; transition: all 0.15s; white-space: nowrap; }
      .btn:active { transform: scale(0.97); }
      .btn-primary { background: ${T.green}; color: white; }
      .btn-primary:hover { background: ${T.greenDark}; }
      .btn-danger { background: ${T.red}; color: white; }
      .btn-danger:hover { filter: brightness(0.9); }
      .btn-orange { background: ${T.orange}; color: white; }
      .btn-outline { background: transparent; border: 1.5px solid ${T.border}; color: ${T.ink}; }
      .btn-outline:hover { border-color: ${T.green}; color: ${T.green}; }
      .btn-ghost { background: transparent; color: ${T.muted}; }
      .btn-ghost:hover { background: ${T.cream}; color: ${T.ink}; }
      .btn-sm { padding: 5px 12px; font-size: 12px; border-radius: 9px; }
      .btn-icon { padding: 7px; border-radius: 9px; }

      /* Cards */
      .card { background: ${T.white}; border-radius: 16px; border: 1px solid ${T.border}; }
      .card-pad { padding: 18px 20px; }
      .stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 14px; margin-bottom: 20px; }
      .stat-card { background: ${T.white}; border-radius: 16px; border: 1px solid ${T.border}; padding: 16px 18px; }
      .stat-label { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: ${T.muted}; margin-bottom: 5px; }
      .stat-value { font-family: 'Nunito', sans-serif; font-weight: 900; font-size: 26px; line-height: 1; }
      .stat-sub { font-size: 11px; color: ${T.muted}; margin-top: 3px; }
      .stat-green { color: ${T.greenDark}; }
      .stat-red { color: ${T.red}; }
      .stat-orange { color: ${T.orange}; }

      /* Table */
      .table-wrap { background: ${T.white}; border-radius: 16px; border: 1px solid ${T.border}; overflow: hidden; }
      table { width: 100%; border-collapse: collapse; }
      thead { background: ${T.cream}; }
      th { padding: 10px 14px; text-align: left; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: ${T.muted}; white-space: nowrap; }
      td { padding: 12px 14px; font-size: 13px; border-top: 1px solid ${T.border}; }
      tr:hover td { background: #fafaf5; }
      .tr-click { cursor: pointer; }

      /* Badges */
      .badge { display: inline-flex; align-items: center; gap: 3px; padding: 3px 9px; border-radius: 99px; font-size: 11px; font-weight: 700; white-space: nowrap; }
      .badge-green { background: ${T.greenBg}; color: ${T.greenDark}; }
      .badge-orange { background: #fff4e6; color: #c47a00; }
      .badge-red { background: ${T.redLight}; color: ${T.red}; }
      .badge-gray { background: #f3f4f6; color: ${T.muted}; }
      .badge-blue { background: #eff6ff; color: #3b82f6; }
      .badge-purple { background: #f5f3ff; color: #7c3aed; }

      /* Modal */
      .modal-backdrop { position: fixed; inset: 0; background: rgba(26,26,26,0.5); z-index: 300; display: flex; align-items: center; justify-content: center; padding: 16px; backdrop-filter: blur(4px); }
      .modal { background: ${T.white}; border-radius: 20px; width: 100%; max-width: 540px; max-height: 92vh; overflow-y: auto; box-shadow: 0 24px 64px rgba(0,0,0,0.18); animation: modalIn 0.2s ease; }
      @keyframes modalIn { from { opacity:0; transform:translateY(12px) scale(0.98); } to { opacity:1; transform:none; } }
      .modal-lg { max-width: 680px; }
      .modal-header { padding: 18px 22px 14px; border-bottom: 1px solid ${T.border}; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; background: white; border-radius: 20px 20px 0 0; z-index: 1; }
      .modal-title { font-family: 'Nunito', sans-serif; font-weight: 800; font-size: 16px; }
      .modal-body { padding: 18px 22px; }
      .modal-footer { padding: 14px 22px; border-top: 1px solid ${T.border}; display: flex; gap: 8px; justify-content: flex-end; }

      /* Form */
      .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .form-group { margin-bottom: 12px; }
      .form-label { display: block; font-size: 11px; font-weight: 700; color: ${T.muted}; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
      .form-input { width: 100%; padding: 9px 13px; border-radius: 11px; border: 1.5px solid ${T.border}; font-family: 'Nunito Sans', sans-serif; font-size: 13.5px; color: ${T.ink}; background: ${T.cream}; transition: border-color 0.15s; outline: none; }
      .form-input:focus { border-color: ${T.green}; background: white; }
      select.form-input { cursor: pointer; }
      .form-input::placeholder { color: #b0aa96; }

      /* Search */
      .search-wrap { position: relative; }
      .search-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: ${T.muted}; font-size: 13px; pointer-events: none; }
      .search-input { padding: 8px 12px 8px 34px; border-radius: 11px; border: 1.5px solid ${T.border}; font-size: 13px; background: ${T.cream}; width: 200px; outline: none; font-family: 'Nunito Sans', sans-serif; color: ${T.ink}; }
      .search-input:focus { border-color: ${T.green}; background: white; }

      /* Tabs */
      .tabs { display: flex; gap: 3px; background: ${T.cream}; border-radius: 12px; padding: 3px; margin-bottom: 18px; }
      .tab { padding: 7px 14px; border-radius: 9px; font-family: 'Nunito', sans-serif; font-weight: 700; font-size: 12.5px; cursor: pointer; color: ${T.muted}; transition: all 0.12s; border: none; background: none; }
      .tab.active { background: white; color: ${T.ink}; box-shadow: 0 1px 4px rgba(0,0,0,0.09); }

      /* Avatar */
      .avatar { border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: 'Nunito', sans-serif; font-weight: 800; color: white; flex-shrink: 0; }

      /* Progress */
      .prog-bar { height: 6px; border-radius: 99px; background: ${T.border}; overflow: hidden; }
      .prog-fill { height: 100%; border-radius: 99px; background: ${T.green}; transition: width 0.4s; }

      /* Finance row */
      .fin-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid ${T.border}; }
      .fin-row:last-child { border-bottom: none; }

      /* Empty */
      .empty { text-align: center; padding: 48px 20px; color: ${T.muted}; }
      .empty-icon { font-size: 36px; margin-bottom: 10px; }
      .empty-text { font-weight: 600; font-size: 14px; }

      /* Calendar */
      .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
      .cal-header-row { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-bottom: 4px; }
      .cal-dayname { text-align: center; font-size: 10.5px; font-weight: 700; color: ${T.muted}; padding: 4px 0; text-transform: uppercase; }
      .cal-day { min-height: 76px; border-radius: 11px; border: 1px solid ${T.border}; background: white; padding: 6px; cursor: pointer; transition: border-color 0.15s; }
      .cal-day:hover { border-color: ${T.green}; }
      .cal-day.today { border-color: ${T.green}; background: ${T.greenBg}; }
      .cal-day.empty { background: transparent; border-color: transparent; cursor: default; }
      .cal-daynum { font-size: 12px; font-weight: 700; color: ${T.muted}; margin-bottom: 3px; }
      .cal-day.today .cal-daynum { color: ${T.greenDark}; }
      .cal-event { border-radius: 5px; font-size: 10px; font-weight: 700; padding: 2px 5px; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .cal-event-green { background: ${T.greenBg}; color: ${T.greenDark}; }
      .cal-event-orange { background: #fff4e6; color: #c47a00; }

      /* Tag chips */
      .chip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1.5px solid transparent; transition: all 0.12s; }
      .chip-active { border-color: ${T.green}; background: ${T.greenBg}; color: ${T.greenDark}; }
      .chip-inactive { border-color: ${T.border}; background: #f5f5f0; color: ${T.muted}; }

      /* Divider */
      .divider { height: 1px; background: ${T.border}; margin: 14px 0; }

      /* Alert */
      .alert { border-radius: 12px; padding: 12px 16px; font-size: 13px; font-weight: 600; margin-bottom: 14px; }
      .alert-error { background: ${T.redLight}; color: ${T.red}; }
      .alert-success { background: ${T.greenBg}; color: ${T.greenDark}; }

      /* Login */
      .login-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: ${T.cream}; padding: 20px; }
      .login-card { background: white; border-radius: 24px; border: 1px solid ${T.border}; padding: 36px; width: 100%; max-width: 380px; box-shadow: 0 8px 32px rgba(0,0,0,0.08); }

      @media (max-width: 768px) {
        .sidebar { display: none; }
        .main { margin-left: 0; }
        .content { padding: 16px; }
        .stats-grid { grid-template-columns: 1fr 1fr; }
        .form-row { grid-template-columns: 1fr; }
      }
    `}</style>
  )
}

export const hashColor = (str = '') => {
  const colors = [T.green, T.orange, '#7c3aed', '#3b82f6', '#ec4899', '#14b8a6', '#f59e0b']
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % colors.length
  return colors[h]
}

export const fmt = (n) => (n ?? 0).toLocaleString('ru-RU') + ' ₽'

export const STATUS_COLORS = {
  'Новый': 'badge-blue',
  'Активен': 'badge-green',
  'Временно отсутствует': 'badge-orange',
  'Неактивен': 'badge-gray',
  'Негатив': 'badge-red',
  'Отказ': 'badge-red',
  'Ожидание': 'badge-purple',
}

export const STATUSES = Object.keys(STATUS_COLORS)
export const ROLES = ['Директор', 'Администратор', 'Преподаватель']
export const ROLE_COLORS = { 'Директор': 'badge-purple', 'Администратор': 'badge-blue', 'Преподаватель': 'badge-green' }
