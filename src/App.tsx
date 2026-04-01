import React, { useState, useEffect, useRef } from 'react'
import {ChevronRight, CheckCircle, Download, AlertCircle, Lock, Globe} from 'lucide-react'

/* ===================== TIPOS ===================== */
interface TrialData {
  participantId: string
  mode: 'lab' | 'remote'
  deviceType: string
  block: number
  trialInBlock: number
  globalTrial: number
  x: number
  word: string
  color: string
  congruent: boolean
  response: boolean | null
  reactionTime: number
  accuracy: boolean
  omitted: boolean
  prevCongruent: boolean | null
  prevResponse: boolean | null
  prevAccuracy: boolean | null
  repetitionWord: boolean
  repetitionColor: boolean
  timestamp: string
}

interface DemographicData {
  age: number
  gender: string
}

interface StroopTrial {
  word: string
  color: string
  congruent: boolean
}

/* ===================== CONFIGURAÇÃO ===================== */
const WORDS = ['VERMELHO', 'VERDE', 'AZUL']
const COLORS = ['red', 'green', 'blue']
const N_BLOCKS = 4
const TRIALS_PER_BLOCK = 20
const PRACTICE_TRIALS = 5
const DEADLINE_MS = 2000
const ITI_MS = 500
const LAB_PASSWORD = 'stroop3laps2026'

// IMPORTANTE: Substituir pela URL do Google Apps Script após deploy
const GOOGLE_SCRIPT_URL = 'YOUR_GOOGLE_SCRIPT_URL_HERE'
const TCLE_DOWNLOAD_URL = 'https://drive.google.com/file/d/1aYWCp-0LnoRaFPmdZiuzPQh08AA1pw0I/view?usp=sharing'

/* ===================== APP ===================== */
const App: React.FC = () => {
  const [phase, setPhase] = useState<'mode-selection' | 'lab-auth' | 'participant-code' | 'demographics' | 'consent' | 'instructions' | 'practice' | 'start-experiment' | 'experiment' | 'iti' | 'interblock' | 'finish'>('mode-selection')
  const [mode, setMode] = useState<'lab' | 'remote' | null>(null)
  const [labPassword, setLabPassword] = useState('')
  const [participantId, setParticipantId] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [deviceType, setDeviceType] = useState('')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState('')
  const [block, setBlock] = useState(0)
  const [trialInBlock, setTrialInBlock] = useState(0)
  const [globalTrial, setGlobalTrial] = useState(0)
  const [blocks, setBlocks] = useState<StroopTrial[][]>([])
  const [practiceTrials, setPracticeTrials] = useState<StroopTrial[]>([])
  const [data, setData] = useState<TrialData[]>([])
  const [isPractice, setIsPractice] = useState(false)
  const [dataSent, setDataSent] = useState(false)
  const [passwordError, setPasswordError] = useState(false)
  const onsetRef = useRef<number | null>(null)

  /* ===================== DETECÇÃO DE DISPOSITIVO ===================== */
  useEffect(() => {
    const detectDevice = (): string => {
      const ua = navigator.userAgent
      if ((navigator as any).userAgentData?.mobile) {
        const isTabletUA = /(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)
        return isTabletUA ? 'Tablet' : 'Smartphone'
      }
      const isIPad = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1
      const isMobileRegex = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
      const isTabletRegex = /(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)
      if (isIPad || isTabletRegex) return 'Tablet'
      if (isMobileRegex) return 'Smartphone'
      return 'Desktop/Laptop'
    }
    setDeviceType(detectDevice())
  }, [])

  /* ===================== GERAÇÃO DE CÓDIGO ===================== */
  const generateParticipantId = (first: string, last: string): string => {
    const firstInitial = first.charAt(0).toUpperCase()
    const lastInitial = last.charAt(0).toUpperCase()
    const randomNumbers = Math.floor(1000 + Math.random() * 9000).toString()
    return `${firstInitial}${lastInitial}-${randomNumbers}`
  }

  /* ===================== GERAÇÃO DE TRIALS ===================== */
  const generateTrials = (n: number): StroopTrial[] => {
    const arr: StroopTrial[] = []
    for (let i = 0; i < n; i++) {
      const congruent = Math.random() < 0.5
      const w = Math.floor(Math.random() * WORDS.length)
      let c = Math.floor(Math.random() * COLORS.length)
      if (!congruent) {
        while (c === w) c = Math.floor(Math.random() * COLORS.length)
      }
      arr.push({ word: WORDS[w], color: COLORS[c], congruent })
    }
    return arr.sort(() => Math.random() - 0.5)
  }

  /* ===================== FLUXO - PRACTICE ===================== */
  useEffect(() => {
    if (phase === 'practice' && practiceTrials.length === 0) {
      setPracticeTrials(generateTrials(PRACTICE_TRIALS))
      setTrialInBlock(0)
      setIsPractice(true)
      startTrial()
    }
  }, [phase, practiceTrials.length])

  /* ===================== FLUXO - EXPERIMENT ===================== */
  useEffect(() => {
    if (phase === 'experiment' && blocks.length === 0 && !isPractice) {
      const bs: StroopTrial[][] = []
      for (let b = 0; b < N_BLOCKS; b++) {
        bs.push(generateTrials(TRIALS_PER_BLOCK))
      }
      setBlocks(bs)
      setBlock(0)
      setTrialInBlock(0)
      setGlobalTrial(0)
      startTrial()
    }
  }, [phase, blocks.length, isPractice])

  /* ===================== INICIAR TRIAL ===================== */
  const startTrial = () => {
    onsetRef.current = performance.now()
  }

  /* ===================== FLUXO - DEADLINE ===================== */
  useEffect(() => {
    if (phase === 'experiment' || phase === 'practice') {
      const t = setTimeout(() => {
        if (onsetRef.current) {
          registerResponse(null)
        }
      }, DEADLINE_MS)
      return () => clearTimeout(t)
    }
  }, [phase, trialInBlock, isPractice])

  /* ===================== FLUXO - ITI ===================== */
  useEffect(() => {
    if (phase === 'iti') {
      const t = setTimeout(() => {
        advance()
      }, ITI_MS)
      return () => clearTimeout(t)
    }
  }, [phase])

  /* ===================== RESPOSTA ===================== */
  const registerResponse = (response: boolean | null) => {
    if (!onsetRef.current) return
    const rt = performance.now() - onsetRef.current
    onsetRef.current = null

    if (isPractice) {
      setPhase('iti')
      return
    }

    const trial = blocks[block][trialInBlock]
    const prev = data[data.length - 1]
    const accuracy = response !== null && response === trial.congruent

    const record: TrialData = {
      participantId,
      mode: mode!,
      deviceType,
      block,
      trialInBlock,
      globalTrial,
      x: trialInBlock / (TRIALS_PER_BLOCK - 1),
      word: trial.word,
      color: trial.color,
      congruent: trial.congruent,
      response,
      reactionTime: rt,
      accuracy,
      omitted: response === null,
      prevCongruent: prev?.congruent ?? null,
      prevResponse: prev?.response ?? null,
      prevAccuracy: prev?.accuracy ?? null,
      repetitionWord: prev ? prev.word === trial.word : false,
      repetitionColor: prev ? prev.color === trial.color : false,
      timestamp: new Date().toISOString(),
    }

    setData(d => [...d, record])
    setPhase('iti')
  }

  /* ===================== AVANÇAR ===================== */
  const advance = () => {
    if (isPractice) {
      if (trialInBlock + 1 < PRACTICE_TRIALS) {
        setTrialInBlock(t => t + 1)
        setPhase('practice')
        startTrial()
      } else {
        setIsPractice(false)
        setPhase('start-experiment')
      }
    } else {
      if (trialInBlock + 1 < TRIALS_PER_BLOCK) {
        setTrialInBlock(t => t + 1)
        setGlobalTrial(g => g + 1)
        setPhase('experiment')
        startTrial()
      } else if (block + 1 < N_BLOCKS) {
        setBlock(b => b + 1)
        setTrialInBlock(0)
        setGlobalTrial(g => g + 1)
        setPhase('interblock')
      } else {
        setPhase('finish')
        sendData()
      }
    }
  }

  /* ===================== ENVIO DE DADOS ===================== */
  const sendData = async () => {
    try {
      await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId,
          mode,
          deviceType,
          demographics: { age: parseInt(age), gender },
          data,
        }),
      })
      setDataSent(true)
    } catch (error) {
      console.error('Erro ao enviar dados:', error)
      setDataSent(false)
    }
  }

  /* ===================== TECLADO ===================== */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (phase === 'experiment' || phase === 'practice') {
        if (e.key === 'ArrowLeft') {
          registerResponse(false)
        } else if (e.key === 'ArrowRight') {
          registerResponse(true)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [phase, block, trialInBlock, isPractice, blocks, data])

  /* ===================== TRIAL ATUAL ===================== */
  const getCurrentTrial = (): StroopTrial | null => {
    if (phase === 'practice' && isPractice) {
      return practiceTrials[trialInBlock] || null
    }
    if (phase === 'experiment' && !isPractice) {
      return blocks[block]?.[trialInBlock] || null
    }
    return null
  }

  const trial = getCurrentTrial()

  /* ===================== HANDLERS ===================== */
  const handleModeSelection = (selectedMode: 'lab' | 'remote') => {
    setMode(selectedMode)
    if (selectedMode === 'lab') {
      setPhase('lab-auth')
    } else {
      setPhase('participant-code')
    }
  }

  const handleLabAuth = () => {
    if (labPassword === LAB_PASSWORD) {
      setPasswordError(false)
      setPhase('demographics')
    } else {
      setPasswordError(true)
    }
  }

  const handleParticipantCode = () => {
    if (participantId.trim()) {
      setPhase('demographics')
    }
  }

  /* ===================== RENDER ===================== */

  /* SELEÇÃO DE MODO */
  if (phase === 'mode-selection') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col items-center justify-center px-4 py-8">
        <div className="max-w-4xl w-full space-y-8">
          <div className="text-center space-y-4">
            <img 
              src="https://www.laps.ufpa.br/assets/img/laps_logo.png" 
              alt="Logo LaPS - UFPA" 
              className="h-24 mx-auto object-contain"
            />
            <h1 className="text-4xl font-bold text-slate-800">Experimento Stroop Online</h1>
            <p className="text-xl text-slate-600">Laboratório de Processamento de Sinais (LaPS) - UFPA</p>
            <p className="text-lg text-slate-500">Pesquisa em Neurociência Cognitiva</p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-8 space-y-6">
            <h2 className="text-2xl font-semibold text-slate-800 text-center">Selecione o Modo de Participação</h2>
            
            <div className="grid md:grid-cols-2 gap-6">
              <button
                onClick={() => handleModeSelection('lab')}
                className="group p-8 rounded-xl border-2 border-slate-300 hover:border-blue-500 hover:bg-blue-50 transition-all duration-200 text-left space-y-4"
              >
                <div className="flex items-center gap-3">
                  <Lock className="w-8 h-8 text-blue-600" />
                  <h3 className="text-xl font-semibold text-slate-800">Modo Laboratório</h3>
                </div>
                <p className="text-slate-600">
                  Para participação presencial supervisionada. Requer senha de acesso fornecida pelos pesquisadores.
                </p>
                <div className="flex items-center text-blue-600 font-medium">
                  Acessar <ChevronRight className="w-5 h-5 ml-1 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>

              <button
                onClick={() => handleModeSelection('remote')}
                className="group p-8 rounded-xl border-2 border-slate-300 hover:border-green-500 hover:bg-green-50 transition-all duration-200 text-left space-y-4"
              >
                <div className="flex items-center gap-3">
                  <Globe className="w-8 h-8 text-green-600" />
                  <h3 className="text-xl font-semibold text-slate-800">Modo Remoto</h3>
                </div>
                <p className="text-slate-600">
                  Para participação online no seu próprio dispositivo. Você pode participar de qualquer lugar.
                </p>
                <div className="flex items-center text-green-600 font-medium">
                  Acessar <ChevronRight className="w-5 h-5 ml-1 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            </div>
          </div>

          <footer className="text-center text-sm text-slate-500 space-y-1 pt-4">
            <p>Pesquisa aprovada pelo Comitê de Ética em Pesquisa da UFPA sob parecer nº 8.085.208.</p>
            <p>Laboratório de Processamento de Sinais (LaPS) – Instituto de Tecnologia (ITEC) – UFPA, 2026.</p>
            <p>Pesquisadores responsáveis: José Antônio de Souza Amador (NTPC) e Dr. Antonio Pereira Jr. (ITEC).</p>
          </footer>
        </div>
      </div>
    )
  }

  /* AUTENTICAÇÃO LABORATÓRIO */
  if (phase === 'lab-auth') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 space-y-6">
          <div className="text-center space-y-2">
            <Lock className="w-12 h-12 text-blue-600 mx-auto" />
            <h2 className="text-2xl font-bold text-slate-800">Modo Laboratório</h2>
            <p className="text-slate-600">Insira a senha fornecida pelos pesquisadores</p>
          </div>

          <div className="space-y-4">
            <input
              type="password"
              value={labPassword}
              onChange={(e) => {
                setLabPassword(e.target.value)
                setPasswordError(false)
              }}
              placeholder="Senha de acesso"
              className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none text-lg"
              onKeyPress={(e) => e.key === 'Enter' && handleLabAuth()}
            />
            
            {passwordError && (
              <div className="flex items-center gap-2 text-red-600 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>Senha incorreta. Tente novamente.</span>
              </div>
            )}

            <button
              onClick={handleLabAuth}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors duration-200"
            >
              Entrar
            </button>

            <button
              onClick={() => setPhase('mode-selection')}
              className="w-full text-slate-600 hover:text-slate-800 font-medium py-2"
            >
              Voltar
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* CÓDIGO DO PARTICIPANTE (MODO REMOTO) */
  if (phase === 'participant-code') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center px-4">
        <div className="max-w-2xl w-full bg-white rounded-2xl shadow-lg p-8 space-y-6">
          <div className="text-center space-y-2">
            <Globe className="w-12 h-12 text-green-600 mx-auto" />
            <h2 className="text-2xl font-bold text-slate-800">Modo Remoto</h2>
            <p className="text-slate-600">Insira suas iniciais para gerar seu código de participante</p>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Primeiro Nome</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Ex: João"
                  maxLength={20}
                  className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:border-green-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Sobrenome</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Ex: Silva"
                  maxLength={20}
                  className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:border-green-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <p className="text-sm text-slate-600 mb-2">Seu código de participante será:</p>
              <p className="text-2xl font-mono font-bold text-slate-800">
                {firstName && lastName ? generateParticipantId(firstName, lastName) : 'XX-0000'}
              </p>
            </div>

            <button
              onClick={() => {
                if (firstName.trim() && lastName.trim()) {
                  setParticipantId(generateParticipantId(firstName, lastName))
                  setPhase('demographics')
                }
              }}
              disabled={!firstName.trim() || !lastName.trim()}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors duration-200"
            >
              Continuar
            </button>

            <button
              onClick={() => setPhase('mode-selection')}
              className="w-full text-slate-600 hover:text-slate-800 font-medium py-2"
            >
              Voltar
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* DADOS DEMOGRÁFICOS */
  if (phase === 'demographics') {
    const ageNum = parseInt(age)
    const isAgeValid = age !== '' && !isNaN(ageNum) && ageNum >= 18
    const isFormValid = isAgeValid && gender !== ''

    // Se modo lab, gerar código automaticamente
    useEffect(() => {
      if (mode === 'lab' && !participantId) {
        const randomFirst = String.fromCharCode(65 + Math.floor(Math.random() * 26))
        const randomLast = String.fromCharCode(65 + Math.floor(Math.random() * 26))
        const randomCode = `${randomFirst}${randomLast}-${Math.floor(1000 + Math.random() * 9000)}`
        setParticipantId(randomCode)
      }
    }, [mode, participantId])

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center px-4">
        <div className="max-w-2xl w-full bg-white rounded-2xl shadow-lg p-8 space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-slate-800">Informações Demográficas</h2>
            {mode === 'lab' && participantId && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-700">Código do Participante:</p>
                <p className="text-xl font-mono font-bold text-blue-800">{participantId}</p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Idade</label>
                <input
                  type="number"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="18+"
                  min="18"
                  max="120"
                  className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none"
                />
                {age !== '' && !isAgeValid && (
                  <p className="text-red-600 text-sm mt-1">Você deve ter 18 anos ou mais</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Sexo</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Selecione</option>
                  <option value="Masculino">Masculino</option>
                  <option value="Feminino">Feminino</option>
                  <option value="Outro">Outro</option>
                  <option value="Prefiro não informar">Prefiro não informar</option>
                </select>
              </div>
            </div>

            <button
              onClick={() => setPhase('consent')}
              disabled={!isFormValid}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors duration-200"
            >
              Continuar
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* TERMO DE CONSENTIMENTO */
  if (phase === 'consent') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-8">
        <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-lg p-8 space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-slate-800">Termo de Consentimento Livre e Esclarecido</h1>
            <p className="text-slate-600">Por favor, leia atentamente antes de prosseguir</p>
            {participantId && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 inline-block">
                <p className="text-sm text-blue-700">Seu código: <span className="font-mono font-bold">{participantId}</span></p>
              </div>
            )}
          </div>

          <div className="prose max-w-none text-slate-700 space-y-4 max-h-96 overflow-y-auto border border-slate-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-slate-800">Aprovação Ética</h3>
            <p className="text-sm">
              Este estudo constitui uma atualização metodológica (emenda) de projeto previamente aprovado pelo 
              Comitê de Ética em Pesquisa da Universidade Federal do Pará (CEP/UFPA), sob o Parecer nº 8.085.208, 
              CAAE nº 93786825.9.0000.0018.
            </p>

            <h3 className="text-lg font-semibold text-slate-800">1. Apresentação e Convite à Participação</h3>
            <p className="text-sm">
              Você está sendo convidado(a) a participar, de forma voluntária, de uma pesquisa científica na área 
              de neurociência cognitiva, realizada de maneira online. Antes de decidir sobre sua participação, é 
              importante que você leia atentamente este Termo de Consentimento Livre e Esclarecido e esclareça 
              quaisquer dúvidas. Sua decisão em participar ou não não trará qualquer prejuízo, e você poderá 
              desistir a qualquer momento, sem necessidade de justificativa.
            </p>

            <h3 className="text-lg font-semibold text-slate-800">2. Objetivo da Pesquisa</h3>
            <p className="text-sm">
              O objetivo desta pesquisa é investigar como a atenção e o controle cognitivo se adaptam ao longo do 
              tempo durante a realização de uma tarefa do tipo Stroop, analisando a influência do contexto sequencial 
              e da história recente de estímulos e respostas sobre o desempenho. Busca-se avaliar se essa adaptação 
              pode ser descrita por parâmetros matemáticos simples, representando a dinâmica do controle cognitivo 
              frente ao conflito perceptual.
            </p>

            <h3 className="text-lg font-semibold text-slate-800">3. Procedimentos</h3>
            <p className="text-sm">
              Caso concorde em participar, você realizará uma tarefa cognitiva online, com duração aproximada de 10 
              a 15 minutos, utilizando seu computador, tablet ou smartphone pessoal.
            </p>
            <p className="text-sm">
              Durante a tarefa, serão apresentadas palavras que nomeiam cores (por exemplo, "VERMELHO", "AZUL"), 
              exibidas em diferentes cores. Sua tarefa será indicar, o mais rápido e corretamente possível, se a 
              palavra apresentada é congruente ou incongruente em relação à cor da tinta.
            </p>
            <p className="text-sm">
              Serão registrados automaticamente pelo sistema: tempos de reação, acertos e erros, informações 
              relacionadas à sequência dos estímulos.
            </p>
            <p className="text-sm">
              Serão coletadas apenas informações sociodemográficas mínimas, especificamente: idade (somente 
              participantes com 18 anos ou mais) e sexo.
            </p>
            <p className="text-sm">
              Não serão solicitados nem armazenados dados pessoais identificáveis, como nome completo, CPF, 
              endereço, e-mail ou endereço IP.
            </p>

            <h3 className="text-lg font-semibold text-slate-800">4. Riscos e Desconfortos</h3>
            <p className="text-sm">
              Os riscos decorrentes da participação são mínimos, semelhantes aos de atividades cognitivas 
              rotineiras realizadas em ambiente digital. Pode ocorrer leve cansaço visual ou mental, devido à 
              necessidade de atenção durante a tarefa. Você poderá interromper sua participação a qualquer 
              momento, bastando fechar a página do experimento, sem qualquer prejuízo.
            </p>

            <h3 className="text-lg font-semibold text-slate-800">5. Benefícios</h3>
            <p className="text-sm">
              Não há benefícios diretos ao participante. De forma indireta, os resultados desta pesquisa poderão 
              contribuir para o avanço do conhecimento científico sobre os mecanismos cognitivos da atenção, do 
              controle cognitivo e da adaptação ao contexto.
            </p>

            <h3 className="text-lg font-semibold text-slate-800">6. Sigilo, Confidencialidade e Anonimato</h3>
            <p className="text-sm">
              Todas as informações coletadas serão tratadas de forma sigilosa e confidencial. Os dados serão 
              armazenados de maneira anonimizada, de modo que não seja possível identificar individualmente os 
              participantes. Os resultados do estudo poderão ser divulgados em artigos científicos, dissertações, 
              teses ou eventos acadêmicos, sempre de forma agregada, sem identificação individual.
            </p>

            <h3 className="text-lg font-semibold text-slate-800">7. Tratamento de Dados Pessoais e LGPD</h3>
            <p className="text-sm">
              Em conformidade com a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018):
            </p>
            <ul className="text-sm list-disc pl-5 space-y-1">
              <li>Base legal: consentimento do participante para fins de pesquisa científica.</li>
              <li>Dados coletados: respostas comportamentais da tarefa, idade e sexo.</li>
              <li>Dados não coletados: nome, e-mail, endereço IP ou qualquer identificador direto.</li>
              <li>Finalidade: análise científica e divulgação acadêmica de resultados agregados.</li>
              <li>Armazenamento: dados desidentificados, armazenados em repositório institucional com acesso 
                restrito aos pesquisadores, pelo período de até 5 anos após a publicação dos resultados.</li>
              <li>Compartilhamento: apenas resultados agregados; bases anonimizadas poderão ser compartilhadas 
                para fins científicos.</li>
              <li>Direitos do participante: com seu código de participante único, você poderá solicitar acesso, 
                correção ou exclusão das informações, bem como revogar seu consentimento, por meio dos contatos 
                informados neste termo.</li>
            </ul>

            <h3 className="text-lg font-semibold text-slate-800">8. Custos, Ressarcimento e Indenização</h3>
            <p className="text-sm">
              A participação nesta pesquisa não envolve custos, pagamentos ou ressarcimentos. Em caso de eventuais 
              danos decorrentes da pesquisa, serão adotadas as providências cabíveis conforme a legislação vigente 
              e as normas éticas aplicáveis.
            </p>

            <h3 className="text-lg font-semibold text-slate-800">9. Esclarecimentos e Contatos</h3>
            <p className="text-sm">
              Em caso de dúvidas sobre a pesquisa, você poderá entrar em contato com os pesquisadores responsáveis:
            </p>
            <ul className="text-sm list-disc pl-5">
              <li>E-mail: apereira@ufpa.br | jose.amador@ntpc.ufpa.br</li>
              <li>Telefone: (91) 3201-7426</li>
            </ul>
            <p className="text-sm">
              Para esclarecimentos quanto aos seus direitos como participante de pesquisa, você poderá contatar o:
            </p>
            <p className="text-sm font-semibold">Comitê de Ética em Pesquisa da UFPA (CEP/UFPA)</p>
            <p className="text-sm">
              Rua Augusto Corrêa, nº 01, Campus Guamá – Setor Profissional<br />
              Prédio da Faculdade de Enfermagem, 2º andar, sala 13<br />
              CEP: 66.075-110 – Belém/PA<br />
              Telefone: (91) 98049-9158<br />
              E-mail: cepccs@ufpa.br
            </p>
          </div>

          <div className="space-y-4">
            <a
              href={TCLE_DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full border-2 border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold py-3 rounded-lg transition-colors duration-200"
            >
              <Download className="w-5 h-5" />
              Baixar TCLE em PDF
            </a>

            <button
              onClick={() => setPhase('instructions')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors duration-200"
            >
              Aceito Participar
            </button>

            <p className="text-center text-sm text-slate-500">
              Ao clicar em "Aceito Participar", você declara que leu e compreendeu este termo e concorda 
              voluntariamente em participar deste estudo.
            </p>
          </div>
        </div>
      </div>
    )
  }

  /* INSTRUÇÕES */
  if (phase === 'instructions') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-8">
        <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-lg p-8 space-y-6">
          <h2 className="text-3xl font-bold text-slate-800 text-center">Instruções</h2>

          <div className="space-y-4 text-slate-700">
            <p className="text-lg">
              Você verá palavras de cores (<strong>VERMELHO</strong>, <strong>VERDE</strong>, <strong>AZUL</strong>) 
              escritas em cores (vermelho, verde, azul).
            </p>

            <div className="bg-slate-50 border-2 border-slate-200 rounded-xl p-6 space-y-4">
              <p className="font-semibold text-lg">Sua tarefa:</p>
              <p>Indicar se a palavra e a cor são <strong>CONGRUENTES</strong> ou <strong>INCONGRUENTES</strong>.</p>

              <div className="grid md:grid-cols-2 gap-4 mt-4">
                <div className="bg-green-50 border border-green-300 rounded-lg p-4">
                  <p className="font-semibold text-green-800 mb-2">Exemplo CONGRUENTE:</p>
                  <p className="text-4xl font-bold text-center" style={{ color: 'red' }}>VERMELHO</p>
                  <p className="text-sm text-green-700 mt-2 text-center">
                    (palavra "VERMELHO" escrita em vermelho)
                  </p>
                </div>

                <div className="bg-red-50 border border-red-300 rounded-lg p-4">
                  <p className="font-semibold text-red-800 mb-2">Exemplo INCONGRUENTE:</p>
                  <p className="text-4xl font-bold text-center" style={{ color: 'blue' }}>VERMELHO</p>
                  <p className="text-sm text-red-700 mt-2 text-center">
                    (palavra "VERMELHO" escrita em azul)
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
              <p className="font-semibold text-lg mb-3">Como responder:</p>
              <div className="flex items-center justify-center gap-8 flex-wrap">
                <div className="text-center">
                  <div className="inline-flex items-center gap-2 bg-slate-600 text-white px-6 py-3 rounded-lg font-semibold mb-2">
                    ← INCONGRUENTE
                  </div>
                  <p className="text-sm text-slate-600">Tecla seta esquerda</p>
                </div>
                <div className="text-center">
                  <div className="inline-flex items-center gap-2 bg-slate-600 text-white px-6 py-3 rounded-lg font-semibold mb-2">
                    CONGRUENTE →
                  </div>
                  <p className="text-sm text-slate-600">Tecla seta direita</p>
                </div>
              </div>
              <p className="text-center text-slate-600 mt-3">Você também pode usar os botões na tela</p>
            </div>

            <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-6">
              <p className="font-semibold text-amber-800 mb-2">Importante:</p>
              <ul className="list-disc list-inside space-y-1 text-slate-700">
                <li>Responda o mais <strong>rápido</strong> e <strong>preciso</strong> possível</li>
                <li>Primeiro, você fará um treino de {PRACTICE_TRIALS} tentativas</li>
                <li>Após o treino, o experimento terá {N_BLOCKS} blocos de {TRIALS_PER_BLOCK} tentativas cada</li>
              </ul>
            </div>
          </div>

          <button
            onClick={() => setPhase('practice')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
          >
            Iniciar Treino
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    )
  }

  /* TRANSIÇÃO TREINO → EXPERIMENTO */
  if (phase === 'start-experiment') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center px-4">
        <div className="max-w-2xl w-full bg-white rounded-2xl shadow-lg p-8 space-y-6">
          <div className="text-center space-y-4">
            <CheckCircle className="w-16 h-16 text-green-600 mx-auto" />
            <h2 className="text-3xl font-bold text-slate-800">Treino Concluído!</h2>
            <p className="text-lg text-slate-600">
              Parabéns! Você completou as {PRACTICE_TRIALS} tentativas de treino.
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 space-y-3">
            <p className="font-semibold text-blue-800">Lembre-se:</p>
            <ul className="list-disc list-inside space-y-1 text-blue-700">
              <li>Responda o mais rápido e preciso possível</li>
              <li>Use as teclas ← (incongruente) e → (congruente)</li>
              <li>Ou clique nos botões na tela</li>
            </ul>
          </div>

          <div className="text-center text-slate-600">
            <p>O experimento terá <strong>{N_BLOCKS} blocos</strong> de <strong>{TRIALS_PER_BLOCK} tentativas</strong> cada.</p>
          </div>

          <button
            onClick={() => setPhase('experiment')}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
          >
            Iniciar Experimento
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    )
  }

  /* PAUSA ENTRE BLOCOS */
  if (phase === 'interblock') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center px-4">
        <div className="max-w-2xl w-full bg-white rounded-2xl shadow-lg p-8 space-y-6">
          <div className="text-center space-y-4">
            <h2 className="text-3xl font-bold text-slate-800">Pausa</h2>
            <p className="text-xl text-slate-600">
              Você completou o bloco <strong>{block}</strong> de <strong>{N_BLOCKS}</strong>.
            </p>
            <p className="text-lg text-slate-500">Descanse por um momento.</p>
          </div>

          <div className="bg-blue-50 rounded-xl p-6 text-center">
            <p className="text-2xl font-semibold text-blue-800">
              {((block / N_BLOCKS) * 100).toFixed(0)}% concluído
            </p>
            <div className="w-full bg-blue-200 rounded-full h-3 mt-3">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                style={{ width: `${(block / N_BLOCKS) * 100}%` }}
              />
            </div>
          </div>

          <button
            onClick={() => setPhase('experiment')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-lg transition-colors duration-200"
          >
            Continuar
          </button>
        </div>
      </div>
    )
  }

  /* ITI - INTERVALO ENTRE TRIALS */
  if (phase === 'iti') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-12 px-4">
        <div className="h-32" />
        
        <div className="flex gap-8 items-center justify-center flex-wrap">
          <button
            className="px-8 py-4 bg-slate-500 text-white text-xl font-semibold rounded-lg cursor-default opacity-50"
          >
            ← INCONGRUENTE
          </button>
          <button
            className="px-8 py-4 bg-slate-500 text-white text-xl font-semibold rounded-lg cursor-default opacity-50"
          >
            CONGRUENTE →
          </button>
        </div>
      </div>
    )
  }

  /* APRESENTAÇÃO DO TRIAL */
  if ((phase === 'experiment' || phase === 'practice') && trial) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-12 px-4">
        <div
          className="text-8xl font-bold"
          style={{ color: trial.color }}
        >
          {trial.word}
        </div>

        <div className="flex gap-8 items-center justify-center flex-wrap">
          <button
            onClick={() => registerResponse(false)}
            className="px-8 py-4 bg-slate-600 hover:bg-slate-700 text-white text-xl font-semibold rounded-lg transition-colors duration-150 active:scale-95"
          >
            ← INCONGRUENTE
          </button>
          <button
            onClick={() => registerResponse(true)}
            className="px-8 py-4 bg-slate-600 hover:bg-slate-700 text-white text-xl font-semibold rounded-lg transition-colors duration-150 active:scale-95"
          >
            CONGRUENTE →
          </button>
        </div>
      </div>
    )
  }

  /* FINALIZAÇÃO */
  if (phase === 'finish') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-8">
        <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-lg p-8 space-y-6">
          <div className="text-center space-y-4">
            {dataSent ? (
              <CheckCircle className="w-16 h-16 text-green-600 mx-auto" />
            ) : (
              <AlertCircle className="w-16 h-16 text-amber-600 mx-auto" />
            )}
            <h2 className="text-3xl font-bold text-slate-800">Experimento Concluído!</h2>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center space-y-3">
            <p className="text-lg text-slate-700">
              Muito obrigado pela sua valiosa participação!
            </p>
            <p className="text-slate-600">
              Sua contribuição é fundamental para o avanço do conhecimento em neurociência cognitiva. 
              Os dados coletados neste experimento ajudarão a compreender melhor os processos de atenção, 
              controle cognitivo e processamento contextual no cérebro humano.
            </p>
            <p className="text-slate-600 font-medium">
              Agradecemos imensamente seu tempo e dedicação a esta pesquisa!
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 space-y-3">
            <p className="font-semibold text-blue-800 text-center">Seu Código de Participante:</p>
            <p className="text-3xl font-mono font-bold text-blue-900 text-center">{participantId}</p>
            <p className="text-sm text-blue-700 text-center">
              Anote este código caso deseje entrar em contato para obter informações sobre seus dados.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-lg p-4 text-center">
              <p className="text-sm text-slate-600">Total de tentativas</p>
              <p className="text-2xl font-bold text-slate-800">{data.length}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-4 text-center">
              <p className="text-sm text-slate-600">Status do envio</p>
              <p className={`text-lg font-semibold ${dataSent ? 'text-green-600' : 'text-amber-600'}`}>
                {dataSent ? '✓ Dados enviados' : '⚠ Verifique conexão'}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-center text-sm text-slate-600 font-medium">Contato: apereira@ufpa.br | jose.amador@ntpc.ufpa.br</p>
            
            <a
              href={TCLE_DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full border-2 border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold py-3 rounded-lg transition-colors duration-200"
            >
              <Download className="w-5 h-5" />
              Baixar TCLE em PDF
            </a>
          </div>

          <footer className="text-center text-sm text-slate-500 space-y-1 pt-4 border-t border-slate-200">
            <p>Pesquisa aprovada pelo Comitê de Ética em Pesquisa da UFPA sob parecer nº 8.085.208.</p>
            <p>Laboratório de Processamento de Sinais (LaPS) – Instituto de Tecnologia (ITEC) – UFPA, 2026.</p>
            <p>Pesquisadores responsáveis: José Antônio de Souza Amador (NTPC) e Dr. Antonio Pereira Jr. (ITEC).</p>
          </footer>
        </div>
      </div>
    )
  }

  return null
}

export default App