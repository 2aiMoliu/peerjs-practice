/* @refresh reload */
import { render } from 'solid-js/web'

import '@fontsource-variable/instrument-sans'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './app.css'

import App from './App'

const root = document.getElementById('root')
render(() => <App />, root!)
