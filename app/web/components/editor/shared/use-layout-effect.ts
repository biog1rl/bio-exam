import { useEffect, useLayoutEffect } from 'react'

import { CAN_USE_DOM } from '@/components/editor/shared/can-use-dom'

// Этот обходной путь больше не нужен в React 19,
// но мы в настоящее время поддерживаем React >=17.x
// https://github.com/facebook/react/pull/26395
const useLayoutEffectImpl: typeof useLayoutEffect = CAN_USE_DOM ? useLayoutEffect : useEffect

export default useLayoutEffectImpl
