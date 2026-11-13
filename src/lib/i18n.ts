import { createSignal } from 'solid-js'

export type Lang = 'en' | 'ja'

const stored = localStorage.getItem('lang')
const [lang, setLang] = createSignal<Lang>(stored === 'ja' ? 'ja' : 'en')

export { lang }

export function switchLang(l: Lang) {
  setLang(l)
  localStorage.setItem('lang', l)
  document.documentElement.lang = l
}

const en = {
  tagline1: 'Put a phone camera',
  tagline2: 'on a desktop screen.',
  openCamera: 'Open a camera',
  openCameraSub: 'use this phone as source',
  watchFeed: 'Watch a feed',
  watchFeedSub: 'enter a code',
  footer: 'practice build · PeerJS cloud',

  askingCamera: 'Asking for camera access…',
  waitingViewer: 'Waiting for a viewer',
  copyWatchLink: 'Copy watch link',
  linkCopied: 'Link copied',
  scanDesktop: 'scan on the desktop',
  scanPhone: 'scan on the phone',
  copyLink: 'copy link',
  copied: 'copied',
  endFeed: 'End feed',
  feedEnded: 'Feed ended',
  backToStart: 'Back to start',
  tryAgain: 'Try again',

  enterCode: 'Enter the code shown on the camera',
  watch: 'Watch',
  codeLen: 'The code has 6 characters.',

  live: 'LIVE',
  feedInterrupted: 'FEED INTERRUPTED',
  reconnecting: 'Reconnecting…',
  connecting: 'Connecting…',
  snapshot: 'Snapshot',
  end: 'End',

  errNoCamera: 'No camera found for that code.',
  errBusy: 'Camera is in use.',
  errNetwork: 'Lost the connection to the camera.',
  errFailed: 'Connection failed. Try again.',
  errDenied: 'Camera permission denied. Allow camera access in the browser, then try again.',
  errAccess: 'Camera access failed. Check browser permissions and try again.',
  errNotFound: 'No camera found on this device.',
  errConn: (type: string) => `Connection error (${type}). Try again.`,
} as const

type Dict = Record<keyof typeof en, string | ((...a: never[]) => string)>

const ja: Dict = {
  tagline1: 'スマホのカメラを',
  tagline2: 'デスクトップの画面に。',
  openCamera: 'カメラを開く',
  openCameraSub: 'このスマホをソースにする',
  watchFeed: '映像を見る',
  watchFeedSub: 'コードを入力',
  footer: '練習ビルド · PeerJSクラウド',

  askingCamera: 'カメラへのアクセスを許可してください…',
  waitingViewer: '視聴者を待機中',
  copyWatchLink: '視聴リンクをコピー',
  linkCopied: 'コピーしました',
  scanDesktop: 'デスクトップでスキャン',
  scanPhone: 'スマホでスキャン',
  copyLink: 'リンクをコピー',
  copied: 'コピーしました',
  endFeed: '配信を終了',
  feedEnded: '配信を終了しました',
  backToStart: 'スタートに戻る',
  tryAgain: '再試行',

  enterCode: 'カメラに表示されたコードを入力',
  watch: '見る',
  codeLen: 'コードは6文字です。',

  live: 'LIVE',
  feedInterrupted: '映像中断',
  reconnecting: '再接続中…',
  connecting: '接続中…',
  snapshot: 'スナップショット',
  end: '終了',

  errNoCamera: 'そのコードのカメラが見つかりません。',
  errBusy: 'カメラは使用中です。',
  errNetwork: 'カメラとの接続が切断されました。',
  errFailed: '接続に失敗しました。もう一度お試しください。',
  errDenied: 'カメラの使用が許可されていません。ブラウザで許可してから再試行してください。',
  errAccess: 'カメラにアクセスできません。ブラウザの権限を確認して再試行してください。',
  errNotFound: 'この端末にカメラが見つかりません。',
  errConn: (type: string) => `接続エラー（${type}）。もう一度お試しください。`,
}

const dicts: Record<Lang, Dict> = { en, ja }

/** Translate a key in the current language. */
export function t(key: keyof typeof en): string {
  const v = dicts[lang()][key]
  return typeof v === 'string' ? v : String(v)
}
