import { HashRouter, Route, Routes } from 'react-router'
import { FeedbackProvider } from './components/feedback'
import { Layout } from './components/Layout'
import { SettingsProvider } from './lib/settings-context'
import { CasePage } from './pages/CasePage'
import { CasesPage } from './pages/CasesPage'
import { DraftPage } from './pages/DraftPage'
import { HomePage } from './pages/HomePage'
import { LibraryPage } from './pages/LibraryPage'
import { NewDraftPage } from './pages/NewDraftPage'
import { SettingsPage } from './pages/SettingsPage'
import { TemplatesPage } from './pages/TemplatesPage'

export function App() {
  return (
    <FeedbackProvider>
      <SettingsProvider>
        <HashRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/casos" element={<CasesPage />} />
              <Route path="/casos/:caseId" element={<CasePage />} />
              <Route path="/escritos/nuevo" element={<NewDraftPage />} />
              <Route path="/escritos/:draftId" element={<DraftPage />} />
              <Route path="/biblioteca" element={<LibraryPage />} />
              <Route path="/plantillas" element={<TemplatesPage />} />
              <Route path="/configuracion" element={<SettingsPage />} />
              <Route path="*" element={<HomePage />} />
            </Routes>
          </Layout>
        </HashRouter>
      </SettingsProvider>
    </FeedbackProvider>
  )
}
