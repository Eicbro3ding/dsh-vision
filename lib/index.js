/**
 * qvl-vision — Client half (browser bundle).
 *
 * Migrated from the dynamic Cordis plugin:
 *   - host.call('qvl.config.get/set')  -> fetch('/api/qvl-vision/config')
 *   - plain function body              -> window.__ModuleLoader__.load({ id, factory })
 *
 * Renders the 「视觉识别」settings section (settings.section).
 */
window.__ModuleLoader__.load({
  id: '@dsh-external/qvl-vision',
  factory: (require) => {
    var exports = { exports: {} }.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    let React = require('react')

    const name = 'qvl-vision'
    const inject = ['slots']

    function QvlSettings(props) {
      const [config, setConfig] = React.useState(null)
      const [mode, setMode] = React.useState('local')
      const [port, setPort] = React.useState('8090')
      const [baseUrl, setBaseUrl] = React.useState('')
      const [model, setModel] = React.useState('')
      const [apiKey, setApiKey] = React.useState('')
      const [temperature, setTemperature] = React.useState('')
      const [maxTokens, setMaxTokens] = React.useState('')
      const [topP, setTopP] = React.useState('')
      const [extra, setExtra] = React.useState('')
      const [thinkingDefault, setThinkingDefault] = React.useState('auto')
      const [thinkingOn, setThinkingOn] = React.useState('')
      const [thinkingOff, setThinkingOff] = React.useState('')
      const [saving, setSaving] = React.useState(false)
      const [msg, setMsg] = React.useState('')

      React.useEffect(() => {
        fetch('/api/qvl-vision/config').then((r) => r.json()).then((c) => {
          if (c) {
            setMode(c.mode || 'local')
            setPort(String(c.localPort ?? 8090))
            setBaseUrl(c.onlineBaseUrl || '')
            setModel(c.onlineModel || '')
            setTemperature(String(c.temperature ?? ''))
            setMaxTokens(String(c.maxTokens ?? ''))
            setTopP(String(c.topP ?? ''))
            setExtra(c.extra || '')
            setThinkingDefault(c.thinkingDefault || 'auto')
            setThinkingOn(c.thinkingOn || '')
            setThinkingOff(c.thinkingOff || '')
            setConfig(c)
          }
        }).catch((e) => setMsg('加载配置失败: ' + String(e)))
      }, [])

      const onSave = () => {
        setSaving(true)
        setMsg('')
        fetch('/api/qvl-vision/config', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            mode,
            localPort: Number(port),
            onlineBaseUrl: baseUrl,
            onlineModel: model,
            onlineApiKey: apiKey,
            temperature,
            maxTokens,
            topP,
            extra,
            thinkingDefault,
            thinkingOn,
            thinkingOff,
          }),
        }).then((r) => r.json()).then((res) => {
          setMsg(res && res.ok ? '已保存' : '保存失败: ' + ((res && res.error) || '未知错误'))
          setSaving(false)
          setApiKey('')
        }).catch((e) => {
          setMsg('保存失败: ' + String(e))
          setSaving(false)
        })
      }

      const inputStyle = { width: '100%', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--dsh-border, #555)', background: 'transparent', color: 'inherit', boxSizing: 'border-box' }
      const rowStyle = { margin: '10px 0' }
      const labelStyle = { display: 'block', fontSize: '12px', opacity: 0.8, marginBottom: '4px' }
      const hintStyle = { fontSize: '11px', opacity: 0.6, marginTop: '2px' }

      const genFields = React.createElement('div', null,
        React.createElement('div', { style: rowStyle },
          React.createElement('label', { style: labelStyle }, 'Temperature（留空不发送）'),
          React.createElement('input', { type: 'number', step: '0.1', style: inputStyle, value: temperature, onChange: (e) => setTemperature(e.target.value), placeholder: '如 0.2 或 1（部分模型仅允许 1）' })
        ),
        React.createElement('div', { style: rowStyle },
          React.createElement('label', { style: labelStyle }, 'Max Tokens（留空不发送）'),
          React.createElement('input', { type: 'number', step: '1', style: inputStyle, value: maxTokens, onChange: (e) => setMaxTokens(e.target.value), placeholder: '如 1024' })
        ),
        React.createElement('div', { style: rowStyle },
          React.createElement('label', { style: labelStyle }, 'Top P（留空不发送）'),
          React.createElement('input', { type: 'number', step: '0.05', style: inputStyle, value: topP, onChange: (e) => setTopP(e.target.value), placeholder: '如 0.9' })
        )
      )

      const thinkingFields = React.createElement('div', null,
        React.createElement('div', { style: rowStyle },
          React.createElement('label', { style: labelStyle }, 'Thinking 默认（工具未指定时）'),
          React.createElement('label', { style: { marginRight: '12px' } },
            React.createElement('input', { type: 'radio', name: 'qvl-thinking', checked: thinkingDefault === 'auto', onChange: () => setThinkingDefault('auto') }),
            ' 跟随模型默认'
          ),
          React.createElement('label', { style: { marginRight: '12px' } },
            React.createElement('input', { type: 'radio', name: 'qvl-thinking', checked: thinkingDefault === 'on', onChange: () => setThinkingDefault('on') }),
            ' 开'
          ),
          React.createElement('label', null,
            React.createElement('input', { type: 'radio', name: 'qvl-thinking', checked: thinkingDefault === 'off', onChange: () => setThinkingDefault('off') }),
            ' 关'
          )
        ),
        React.createElement('div', { style: rowStyle },
          React.createElement('label', { style: labelStyle }, 'Thinking 开启时附加参数（JSON）'),
          React.createElement('textarea', { rows: 2, style: inputStyle, value: thinkingOn, onChange: (e) => setThinkingOn(e.target.value), placeholder: '如 {"chat_template_kwargs":{"enable_thinking":true}}' })
        ),
        React.createElement('div', { style: rowStyle },
          React.createElement('label', { style: labelStyle }, 'Thinking 关闭时附加参数（JSON）'),
          React.createElement('textarea', { rows: 2, style: inputStyle, value: thinkingOff, onChange: (e) => setThinkingOff(e.target.value), placeholder: '如 {"chat_template_kwargs":{"enable_thinking":false}}' }),
          React.createElement('div', { style: hintStyle }, '按你的服务商要求填写；不兼容时留空则不做任何附加。')
        )
      )

      return React.createElement('div', { style: { padding: '4px 12px 12px' } },
        React.createElement('div', { style: { fontSize: '13px', fontWeight: 600, marginBottom: '6px' } }, '视觉识别（Qwen3VL）'),
        React.createElement('div', { style: rowStyle },
          React.createElement('label', { style: labelStyle }, '识别后端'),
          React.createElement('label', { style: { marginRight: '12px' } },
            React.createElement('input', { type: 'radio', name: 'qvl-mode', checked: mode === 'local', onChange: () => setMode('local') }),
            ' 本地 llama.cpp（Qwen3VL-2B）'
          ),
          React.createElement('label', null,
            React.createElement('input', { type: 'radio', name: 'qvl-mode', checked: mode === 'online', onChange: () => setMode('online') }),
            ' 在线 API（OpenAI 兼容）'
          )
        ),
        mode === 'local'
          ? React.createElement('div', null,
              React.createElement('div', { style: rowStyle },
                React.createElement('label', { style: labelStyle }, '本地端口'),
                React.createElement('input', { type: 'number', style: inputStyle, value: port, onChange: (e) => setPort(e.target.value) })
              ),
              genFields,
              thinkingFields
            )
          : React.createElement('div', null,
              React.createElement('div', { style: rowStyle },
                React.createElement('label', { style: labelStyle }, 'API Base URL（如 https://api.siliconflow.cn/v1）'),
                React.createElement('input', { type: 'text', style: inputStyle, value: baseUrl, onChange: (e) => setBaseUrl(e.target.value), placeholder: 'https://api.example.com/v1' })
              ),
              React.createElement('div', { style: rowStyle },
                React.createElement('label', { style: labelStyle }, '模型名'),
                React.createElement('input', { type: 'text', style: inputStyle, value: model, onChange: (e) => setModel(e.target.value), placeholder: 'Qwen/Qwen2.5-VL-7B-Instruct' })
              ),
              React.createElement('div', { style: rowStyle },
                React.createElement('label', { style: labelStyle }, 'API Key（留空表示不修改已保存的 Key）'),
                React.createElement('input', { type: 'password', style: inputStyle, value: apiKey, onChange: (e) => setApiKey(e.target.value), placeholder: config && config.hasApiKey ? '已设置（留空保持不变）' : '未设置' })
              ),
              genFields,
              thinkingFields,
              React.createElement('div', { style: rowStyle },
                React.createElement('label', { style: labelStyle }, '额外参数（JSON，合并进请求体）'),
                React.createElement('textarea', { rows: 3, style: inputStyle, value: extra, onChange: (e) => setExtra(e.target.value), placeholder: '如 {"reasoning_effort": "low"}，留空不发送' }),
                React.createElement('div', { style: hintStyle }, '任意模型参数都会随请求发送，覆盖上面的同名项。')
              )
            ),
        React.createElement('button', { onClick: onSave, disabled: saving, style: { marginTop: '10px', padding: '6px 18px', cursor: 'pointer' } }, saving ? '保存中…' : '保存'),
        msg ? React.createElement('div', { style: { marginTop: '8px', fontSize: '12px', opacity: 0.9 } }, msg) : null
      )
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return
      slots.inject('settings.section', () => slots.register(
        { name: 'settings.section', id: 'qvl-vision', order: 30, label: () => '视觉识别' },
        (props) => React.createElement(QvlSettings, { close: props.close })
      ))
    }

    exports.apply = apply
    exports.inject = inject
    exports.name = name
    return exports
  },
})
