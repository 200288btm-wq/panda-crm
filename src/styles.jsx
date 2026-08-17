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
      body { font-family: 'Nunito Sans', sans-serif; background: ${T.cream}; color: ${T.ink}; -webkit-font-smoothing: antialiased; -webkit-tap-highlight-color: transparent; }
      ::-webkit-scrollbar { width: 4px; height: 4px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: ${T.greenLight}; border-radius: 10px; }

      .app { display: flex; height: 100vh; height: 100dvh; overflow: hidden; }

      /* ── Sidebar ── */
      .sidebar { width: 230px; min-width: 230px; height: 100%; background: ${T.white}; border-right: 1px solid ${T.border}; display: flex; flex-direction: column; overflow-y: auto; overflow-x: hidden; transition: width 0.25s ease, min-width 0.25s ease; z-index: 100; flex-shrink: 0; }
      .sidebar.collapsed { width: 56px; min-width: 56px; }
      .sidebar-logo { padding: 14px 14px 10px; border-bottom: 1px solid ${T.border}; overflow: hidden; white-space: nowrap; }
      .logo-row { display: flex; align-items: center; gap: 10px; }
      .logo-name { font-family: 'Nunito', sans-serif; font-weight: 900; font-size: 15px; color: ${T.ink}; transition: opacity 0.2s; white-space: nowrap; }
      .logo-sub { font-size: 10px; color: ${T.muted}; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; transition: opacity 0.2s; }
      .sidebar.collapsed .logo-name, .sidebar.collapsed .logo-sub { opacity: 0; width: 0; overflow: hidden; }
      .nav-section { padding: 8px 0 2px; overflow: hidden; }
      .nav-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${T.muted}; padding: 0 16px 4px; white-space: nowrap; transition: opacity 0.2s; }
      .sidebar.collapsed .nav-label { opacity: 0; }
      .nav-item { display: flex; align-items: center; gap: 10px; padding: 9px 16px; cursor: pointer; font-size: 13px; font-weight: 600; color: ${T.muted}; transition: all 0.12s; position: relative; white-space: nowrap; overflow: hidden; }
      .nav-item:hover { background: ${T.cream}; color: ${T.ink}; }
      .nav-item.active { background: ${T.greenBg}; color: ${T.greenDark}; }
      .nav-item.active::before { content: ''; position: absolute; left: 0; top: 5px; bottom: 5px; width: 3px; background: ${T.green}; border-radius: 0 3px 3px 0; }
      .nav-icon { width: 20px; min-width: 20px; text-align: center; font-size: 16px; }
      .nav-label-text { transition: opacity 0.2s; overflow: hidden; }
      .sidebar.collapsed .nav-label-text { opacity: 0; width: 0; }
      .nav-badge { margin-left: auto; background: ${T.orange}; color: white; border-radius: 99px; font-size: 10px; font-weight: 700; padding: 1px 7px; transition: opacity 0.2s; }
      .sidebar.collapsed .nav-badge { opacity: 0; }
      /* Разделитель вместо заголовка секции: группировка видна, строка не тратится */
      .nav-divider { height: 1px; background: ${T.border}; margin: 8px 16px; }
      .sidebar.collapsed .nav-divider { margin: 8px 10px; }
      /* Раскрывающаяся группа («Финансы») */
      .nav-chevron { margin-left: auto; font-size: 10px; color: ${T.muted}; transition: opacity 0.2s, transform 0.15s; }
      .sidebar.collapsed .nav-chevron { opacity: 0; }
      .nav-item.group-open { color: ${T.ink}; }
      .nav-sub { padding-left: 46px; font-size: 13px; font-weight: 500; }
      .nav-sub.active { font-weight: 700; }
      /* Шестерёнка в шапке — «настраивается один раз» живёт здесь, не в меню */
      .topbar-icon-btn { width: 36px; height: 36px; border-radius: 50%; border: none; background: ${T.cream};
        cursor: pointer; font-size: 16px; display: inline-flex; align-items: center; justify-content: center;
        transition: transform 0.15s, background 0.15s; flex-shrink: 0; }
      .topbar-icon-btn:hover { transform: scale(1.05); background: ${T.greenBg}; }
      .topbar-icon-btn:active { transform: scale(0.95); }
      .topbar-icon-btn.active { background: ${T.greenBg}; box-shadow: inset 0 0 0 1.5px ${T.green}; }
      .user-avatar-btn { transition: transform 0.15s, box-shadow 0.15s; }
      .user-avatar-btn:hover { transform: scale(1.05); box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
      .user-avatar-btn:active { transform: scale(0.95); }
      .sidebar-toggle { position: absolute; top: 50%; transform: translateY(-50%); right: -14px; width: 28px; height: 28px; background: white; border: 1.5px solid ${T.border}; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 110; font-size: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: all 0.2s; }
      .sidebar-toggle:hover { background: ${T.greenBg}; border-color: ${T.green}; }
      /* height: 100% — панель тянется на всю высоту сама, а не «до последнего
         пункта»: короткое меню обрывалось белой полосой посередине экрана */
      .sidebar-wrapper { position: relative; flex-shrink: 0; height: 100%; }

      /* ── Плашки-сообщения (вместо alert) ── */
      .toast-wrap { position: fixed; right: 20px; bottom: 20px; z-index: 500; display: flex; flex-direction: column; gap: 8px; align-items: flex-end; pointer-events: none; }
      .toast { pointer-events: auto; display: flex; align-items: flex-start; gap: 10px; min-width: 260px; max-width: 380px;
        background: white; border: 1px solid ${T.border}; border-left-width: 4px; border-radius: 12px;
        padding: 11px 12px; box-shadow: 0 6px 24px rgba(0,0,0,0.14); cursor: pointer;
        animation: toast-in 0.18s ease-out; }
      .toast-success { border-left-color: ${T.green}; }
      .toast-error { border-left-color: ${T.red}; }
      .toast-info { border-left-color: ${T.orange}; }
      .toast-icon { font-size: 15px; line-height: 1.3; flex-shrink: 0; }
      .toast-body { min-width: 0; flex: 1; }
      .toast-text { font-size: 13px; font-weight: 600; color: ${T.ink}; line-height: 1.45; word-break: break-word; }
      .toast-details { font-size: 11px; color: ${T.muted}; margin-top: 3px; line-height: 1.4; word-break: break-word; }
      .toast-close { background: none; border: none; color: ${T.muted}; cursor: pointer; font-size: 12px; padding: 0 2px; line-height: 1; flex-shrink: 0; font-family: inherit; }
      @keyframes toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

      /* ── Main ── */
      .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
      .topbar { background: ${T.white}; border-bottom: 1px solid ${T.border}; padding: 0 16px; height: 52px; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
      .content { flex: 1; overflow-y: auto; padding: 16px; }
      .page-title { font-family: 'Nunito', sans-serif; font-weight: 800; font-size: 18px; }
      .topbar-right { display: flex; align-items: center; gap: 10px; }

      /* ── Buttons ── */
      .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 12px; font-family: 'Nunito', sans-serif; font-weight: 700; font-size: 13px; cursor: pointer; border: none; transition: all 0.15s; white-space: nowrap; -webkit-tap-highlight-color: transparent; }
      .btn:active { transform: scale(0.96); }
      .btn-primary { background: ${T.green}; color: white; }
      .btn-primary:hover { background: ${T.greenDark}; }
      .btn-danger { background: ${T.red}; color: white; }
      .btn-outline { background: transparent; border: 1.5px solid ${T.border}; color: ${T.ink}; }
      .btn-outline:hover { border-color: ${T.green}; color: ${T.green}; }
      .btn-ghost { background: transparent; color: ${T.muted}; }
      .btn-ghost:hover { background: ${T.cream}; color: ${T.ink}; }
      .btn-sm { padding: 5px 11px; font-size: 12px; border-radius: 9px; }
      .btn-icon { padding: 7px; border-radius: 9px; }

      /* ── Cards ── */
      .card { background: ${T.white}; border-radius: 14px; border: 1px solid ${T.border}; }
      .card-pad { padding: 16px 18px; }
      .stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; margin-bottom: 18px; }
      .stat-card { background: ${T.white}; border-radius: 14px; border: 1px solid ${T.border}; padding: 14px 16px; }
      .stat-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: ${T.muted}; margin-bottom: 4px; }
      .stat-value { font-family: 'Nunito', sans-serif; font-weight: 900; font-size: 24px; line-height: 1; }
      .stat-sub { font-size: 11px; color: ${T.muted}; margin-top: 3px; }
      .stat-green { color: ${T.greenDark}; }
      .stat-red { color: ${T.red}; }
      .stat-orange { color: ${T.orange}; }

      /* ── Table ── */
      .show-mobile { display: none; }
      .show-desktop { display: block; }
      .table-wrap { background: ${T.white}; border-radius: 14px; border: 1px solid ${T.border}; overflow: hidden; overflow-x: auto; -webkit-overflow-scrolling: touch; }
      table { width: 100%; border-collapse: collapse; min-width: 500px; }
      thead { background: ${T.cream}; }
      th { padding: 10px 12px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: ${T.muted}; white-space: nowrap; }
      td { padding: 11px 12px; font-size: 13px; border-top: 1px solid ${T.border}; }
      tr:hover td { background: #fafaf5; }
      .tr-click { cursor: pointer; }

      /* ── Badges ── */
      .badge { display: inline-flex; align-items: center; gap: 3px; padding: 3px 8px; border-radius: 99px; font-size: 11px; font-weight: 700; white-space: nowrap; }
      .badge-green { background: ${T.greenBg}; color: ${T.greenDark}; }
      .badge-orange { background: #fff4e6; color: #c47a00; }
      .badge-red { background: ${T.redLight}; color: ${T.red}; }
      .badge-gray { background: #f3f4f6; color: ${T.muted}; }
      .badge-blue { background: #eff6ff; color: #3b82f6; }
      .badge-purple { background: #f5f3ff; color: #7c3aed; }

      /* ── Modal ── */
      .modal-backdrop { position: fixed; inset: 0; background: rgba(26,26,26,0.5); z-index: 300; display: flex; align-items: flex-end; justify-content: center; padding: 0; backdrop-filter: blur(4px); }
      .modal { background: ${T.white}; border-radius: 20px 20px 0 0; width: 100%; max-width: 100%; max-height: 92vh; overflow-y: auto; box-shadow: 0 -4px 32px rgba(0,0,0,0.18); animation: modalUp 0.25s ease; }
      @keyframes modalUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      .modal-lg { max-width: 100%; }
      .modal-header { padding: 16px 20px 12px; border-bottom: 1px solid ${T.border}; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; background: white; border-radius: 20px 20px 0 0; z-index: 1; }
      .modal-title { font-family: 'Nunito', sans-serif; font-weight: 800; font-size: 16px; }
      .modal-body { padding: 16px 20px; }
      .modal-footer { padding: 12px 20px; border-top: 1px solid ${T.border}; display: flex; gap: 8px; justify-content: flex-end; }

      /* На десктопе модалка была шторкой во всю ширину: поле «Название»
         растягивалось на весь экран. Здесь она становится обычным
         центрированным окном с читаемой шириной строки. */
      @media (min-width: 769px) {
        .modal-backdrop { align-items: center; padding: 24px; }
        .modal { max-width: 720px; border-radius: 20px; max-height: 88vh; animation: modalIn 0.18s ease; }
        .modal-lg { max-width: 940px; }
        .modal-header { border-radius: 20px 20px 0 0; padding: 18px 24px 14px; }
        .modal-body { padding: 20px 24px; }
        .modal-footer { padding: 14px 24px; position: sticky; bottom: 0; background: white; border-radius: 0 0 20px 20px; }
      }
      @keyframes modalIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }

      /* Три поля в строку — на узком экране схлопывается в одну колонку */
      .form-row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }

      /* ── Подсказка в значке вопроса ── */
      .hint-wrap { position: relative; display: inline-flex; vertical-align: middle; margin-left: 5px; }
      .hint-btn { width: 15px; height: 15px; border-radius: 50%; border: none; padding: 0; cursor: pointer;
                  background: ${T.border}; color: ${T.muted}; font-size: 10px; font-weight: 800;
                  line-height: 15px; text-align: center; font-family: inherit; transition: all 0.15s; }
      .hint-btn:hover, .hint-btn[aria-expanded="true"] { background: ${T.green}; color: white; }
      /* Рисуется порталом в <body>: внутри модалки со своим скроллом
         подсказку обрезало краем окна. Отсюда fixed, а не absolute. */
      .hint-pop { position: fixed; z-index: 500;
                  background: ${T.ink}; color: white; border-radius: 10px; padding: 9px 12px;
                  font-size: 12px; font-weight: 500; line-height: 1.5; text-transform: none;
                  letter-spacing: 0; box-shadow: 0 6px 20px rgba(0,0,0,0.22);
                  pointer-events: none; font-family: 'Nunito Sans', sans-serif; }
      .hint-arrow { position: absolute; width: 10px; height: 10px;
                    background: ${T.ink}; transform: rotate(45deg); border-radius: 2px; }

      /* ── Form ── */
      .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .form-group { margin-bottom: 12px; }
      .form-label { display: block; font-size: 11px; font-weight: 700; color: ${T.muted}; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
      .form-input { width: 100%; padding: 10px 13px; border-radius: 11px; border: 1.5px solid ${T.border}; font-family: 'Nunito Sans', sans-serif; font-size: 14px; color: ${T.ink}; background: ${T.cream}; transition: border-color 0.15s; outline: none; -webkit-appearance: none; }
      .form-input:focus { border-color: ${T.green}; background: white; }
      select.form-input { cursor: pointer; }
      .form-input::placeholder { color: #b0aa96; }

      /* ── Search ── */
      .search-wrap { position: relative; }
      .search-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: ${T.muted}; font-size: 13px; pointer-events: none; }
      .search-input { padding: 9px 12px 9px 34px; border-radius: 11px; border: 1.5px solid ${T.border}; font-size: 13px; background: ${T.cream}; width: 200px; outline: none; font-family: 'Nunito Sans', sans-serif; color: ${T.ink}; -webkit-appearance: none; }
      .search-input:focus { border-color: ${T.green}; background: white; }

      /* ── Tabs ── */
      .tabs { display: flex; gap: 3px; background: ${T.cream}; border-radius: 12px; padding: 3px; margin-bottom: 16px; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
      .tabs::-webkit-scrollbar { display: none; }
      .tab { padding: 7px 12px; border-radius: 9px; font-family: 'Nunito', sans-serif; font-weight: 700; font-size: 12px; cursor: pointer; color: ${T.muted}; transition: all 0.12s; border: none; background: none; white-space: nowrap; flex-shrink: 0; }
      .tab.active { background: white; color: ${T.ink}; box-shadow: 0 1px 4px rgba(0,0,0,0.09); }

      /* ── Avatar ── */
      .avatar { border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: 'Nunito', sans-serif; font-weight: 800; color: white; flex-shrink: 0; }

      /* ── Progress ── */
      .prog-bar { height: 6px; border-radius: 99px; background: ${T.border}; overflow: hidden; }
      .prog-fill { height: 100%; border-radius: 99px; background: ${T.green}; transition: width 0.4s; }

      .fin-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid ${T.border}; }
      .fin-row:last-child { border-bottom: none; }

      .empty { text-align: center; padding: 40px 20px; color: ${T.muted}; }
      .empty-icon { font-size: 32px; margin-bottom: 8px; }
      .empty-text { font-weight: 600; font-size: 14px; }

      /* ── Calendar ── */
      .cal-outer { width: 100%; overflow: hidden; }
      .cal-grid { display: grid; grid-template-columns: repeat(7, minmax(0,1fr)); gap: 2px; width: 100%; }
      .cal-header-row { display: grid; grid-template-columns: repeat(7, minmax(0,1fr)); gap: 2px; margin-bottom: 2px; width: 100%; }
      .cal-dayname { text-align: center; font-size: 10px; font-weight: 700; color: ${T.muted}; padding: 4px 0; text-transform: uppercase; overflow: hidden; min-width: 0; }
      .cal-day { min-height: 68px; border-radius: 8px; border: 1px solid ${T.border}; background: white; padding: 4px 2px; cursor: pointer; transition: border-color 0.15s; overflow: hidden; min-width: 0; }
      .cal-day:hover { border-color: ${T.green}; }
      .cal-day.today { border-color: ${T.green}; background: ${T.greenBg}; }
      .cal-day.empty { background: transparent; border-color: transparent; cursor: default; }
      .cal-daynum { font-size: 11px; font-weight: 700; color: ${T.muted}; margin-bottom: 2px; text-align: center; }
      .cal-day.today .cal-daynum { color: ${T.greenDark}; }
      .cal-event { border-radius: 4px; font-size: 10px; font-weight: 700; padding: 2px 4px; margin-bottom: 2px; white-space: normal; overflow: hidden; display: block; max-width: 100%; line-height: 1.3; word-break: break-word; }

      .chip { display: inline-flex; align-items: center; gap: 4px; padding: 5px 10px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1.5px solid transparent; transition: all 0.12s; }
      .chip-active { border-color: ${T.green}; background: ${T.greenBg}; color: ${T.greenDark}; }
      .chip-inactive { border-color: ${T.border}; background: #f5f5f0; color: ${T.muted}; }

      .divider { height: 1px; background: ${T.border}; margin: 12px 0; }
      .alert { border-radius: 12px; padding: 10px 14px; font-size: 13px; font-weight: 600; margin-bottom: 12px; }
      .alert-error { background: ${T.redLight}; color: ${T.red}; }
      .alert-success { background: ${T.greenBg}; color: ${T.greenDark}; }
      .alert-warning { background: #fef3c7; color: #92400e; }

      .login-page { min-height: 100vh; min-height: 100dvh; display: flex; align-items: center; justify-content: center; background: ${T.cream}; padding: 20px; }
      .login-card { background: white; border-radius: 20px; border: 1px solid ${T.border}; padding: 32px 28px; width: 100%; max-width: 360px; box-shadow: 0 8px 32px rgba(0,0,0,0.08); }

      /* ── Mobile bottom nav ── */
      .mobile-nav { display: none; }
      .sidebar-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 99; }
      .sidebar-scroll-fade { display: none; }
      .topbar-hamburger { display: none; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 10px; cursor: pointer; background: ${T.cream}; border: none; font-size: 18px; flex-shrink: 0; }

      /* ══════════════════════
         MOBILE — iPhone 7+
         ══════════════════════ */
      @media (max-width: 768px) {
        .form-row-3 { grid-template-columns: 1fr; }
        .sidebar-wrapper { display: none !important; }
        .sidebar-wrapper.mobile-open { display: block !important; position: fixed; inset: 0; z-index: 200; }
        .sidebar-overlay { display: block; }
        /* 100vh на iOS Safari — это высота БЕЗ учёта адресной строки и
           нижней панели, поэтому низ меню уходил под них и последний
           пункт было не достать. 100dvh считает реальную видимую высоту;
           100vh оставлен запасным для старых браузеров. */
        .sidebar { position: fixed; left: 0; top: 0; height: 100vh; height: 100dvh; transform: translateX(-100%); transition: transform 0.25s ease; width: 260px !important; min-width: 260px !important; box-shadow: 4px 0 20px rgba(0,0,0,0.15); overflow-y: auto !important; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
        /* Запас снизу: последний пункт не должен липнуть к краю, иначе
           непонятно, что список кончился, а не обрезался */
        .sidebar { padding-bottom: calc(28px + env(safe-area-inset-bottom)); }
        /* Подсказка, что список прокручивается: нижний край растворяется,
           пока не долистали до конца */
        .sidebar-scroll-fade { display: block; position: sticky; bottom: 0; height: 24px; margin-top: -24px; pointer-events: none;
          background: linear-gradient(to bottom, rgba(255,255,255,0), ${T.white}); }
        .sidebar-wrapper.mobile-open .sidebar { transform: translateX(0); }
        .sidebar-toggle { display: none !important; }

        /* Sidebar user visible on mobile */
        .sidebar-user { display: flex !important; padding: 16px 14px; }
        .user-info { opacity: 1 !important; width: auto !important; }
        /* Аватар пользователя в шапке на мобиле — компактнее */
        .user-avatar-btn { width: 32px !important; height: 32px !important; font-size: 12px !important; }
        .user-dropdown { right: -4px !important; min-width: 220px !important; }

        .main { width: 100%; }
        .topbar { padding: 0 12px; }
        .topbar-hamburger { display: flex !important; }
        .content { padding: 12px 12px 80px; }

        /* Скрыть на мобиле */
        .hide-mobile { display: none !important; }
        /* Адаптивные блоки */
        .show-desktop { display: none !important; }
        .show-mobile { display: flex !important; }

        .mobile-nav {
          display: flex; position: fixed; bottom: 0; left: 0; right: 0;
          background: white; border-top: 1px solid ${T.border};
          z-index: 100; padding-bottom: env(safe-area-inset-bottom, 0px);
          box-shadow: 0 -2px 12px rgba(0,0,0,0.08);
        }
        .mobile-nav-item {
          flex: 1; display: flex; flex-direction: column; align-items: center;
          justify-content: center; padding: 8px 2px; cursor: pointer;
          color: ${T.muted}; font-size: 10px; font-weight: 600; gap: 2px;
          position: relative; -webkit-tap-highlight-color: transparent;
          min-width: 0;
        }
        .mobile-nav-item.active { color: ${T.greenDark}; }
        .mobile-nav-icon { font-size: 22px; line-height: 1; }
        .mobile-nav-label { font-size: 10px; white-space: nowrap; }
        .mobile-nav-badge { position: absolute; top: 4px; right: calc(50% - 18px); background: ${T.orange}; color: white; border-radius: 99px; font-size: 9px; font-weight: 700; padding: 1px 5px; }

        /* Над нижним меню, чтобы плашка его не перекрывала */
        .toast-wrap { left: 10px; right: 10px; bottom: calc(72px + env(safe-area-inset-bottom, 0px)); align-items: stretch; }
        .toast { min-width: 0; max-width: none; }

        .stats-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
        .form-row { grid-template-columns: 1fr; gap: 0; }
        .table-wrap { border-radius: 12px; }
        .search-input { width: 100%; }

        /* iOS Safari зумит страницу, если шрифт поля меньше 16px.
           Ставим 16px только на мобиле — на десктопе вёрстка не меняется. */
        .form-input, .search-input, input, select, textarea { font-size: 16px !important; }
        .form-input { padding: 11px 13px; }
        .search-input { padding: 11px 12px 11px 34px; }
        .search-wrap { flex: 1; }
        .page-title { font-size: 16px; }

        /* Calendar mobile fix */
        .cal-grid { gap: 2px; }
        .cal-header-row { gap: 2px; margin-bottom: 2px; }
        .cal-dayname { font-size: 9px; padding: 3px 1px; }
        .cal-day { min-height: 48px; padding: 3px 2px; border-radius: 7px; }
        .cal-event { font-size: 8px; padding: 1px 2px; }
        .cal-daynum { font-size: 10px; margin-bottom: 2px; }
      }

      /* Пока открыта модалка, фон под ней не прокручивается */
      body.modal-open { overflow: hidden; }

      @supports (padding-bottom: env(safe-area-inset-bottom)) {
        @media (max-width: 768px) {
          .mobile-nav { padding-bottom: env(safe-area-inset-bottom); }
          .content { padding-bottom: calc(76px + env(safe-area-inset-bottom)); }
        }
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

// ── Даты ─────────────────────────────────────────────────────
// toISOString() отдаёт UTC: в Екатеринбурге (UTC+5) всё, что заводится
// с 00:00 до 05:00 местного, встаёт вчерашним числом. Считаем локально.
export const toLocalISO = (date) => {
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const todayLocal = () => toLocalISO(new Date())

/** ГГГГ-ММ-ДД → ДД.ММ.ГГГГ для показа. Принимает и timestamp. */
export const ruDate = (iso) => {
  if (!iso) return '—'
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso)
}

export const STATUS_COLORS = {
  'Новый': 'badge-blue', 'Активен': 'badge-green',
  'Временно отсутствует': 'badge-orange', 'Неактивен': 'badge-gray',
  'Негатив': 'badge-red', 'Отказ': 'badge-red', 'Ожидание': 'badge-purple',
}

export const STATUSES = Object.keys(STATUS_COLORS)
export const ROLES = ['Директор', 'Администратор', 'Преподаватель']
export const ROLE_COLORS = { 'Директор': 'badge-purple', 'Администратор': 'badge-blue', 'Преподаватель': 'badge-green' }

// Палитра адресов. Живёт здесь, а не в AddressesPage, потому что тем же
// цветом красится расписание в режиме «Цвет: по адресам».
export const ADDRESS_COLORS = ['#2563eb','#dc2626','#16a34a','#9333ea','#ea580c','#0891b2','#db2777','#65a30d','#4f46e5','#0d9488']

// Цвет адреса с запасным вариантом. Адрес, заведённый быстрым добавлением,
// сохраняется без цвета — раньше карточка адресов рисовала его первым цветом
// палитры, а расписание не находило цвета вовсе и брало цвет направления.
// Теперь и там и там один и тот же расчёт: цвет по месту в списке.
export const addressColor = (addr, list = []) => {
  if (!addr) return null
  if (addr.color) return addr.color
  const idx = list.findIndex(a => String(a.id) === String(addr.id))
  return ADDRESS_COLORS[(idx < 0 ? 0 : idx) % ADDRESS_COLORS.length]
}
