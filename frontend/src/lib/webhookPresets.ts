/** Hazır webhook ayarları — JS yazmadan kullanılabilir */

export type WebhookPresetId =
  | 'template_simple'
  | 'template_temp_alarm'
  | 'js_temp_alarm'

export interface WebhookPreset {
  id: WebhookPresetId
  label: string
  description: string
  name: string
  topic_pattern: string
  useScript: boolean
  useTemplates: boolean
  body_template?: string
  transform_script?: string
}

/** JS yok — her mesajı n8n'e iletir (şablon ile) */
export const PRESET_TEMPLATE_SIMPLE: WebhookPreset = {
  id: 'template_simple',
  label: 'Basit ilet (JS yok)',
  description: 'Gelen mesajı olduğu gibi n8n\'e gönderir. JS kapalı, şablon açık.',
  name: 'Mesaj İletici',
  topic_pattern: 'ev/+/sicaklik',
  useScript: false,
  useTemplates: true,
  body_template: `{
  "topic": "{{topic}}",
  "oda": "{{topic_parts.1}}",
  "cihaz": "{{sender}}",
  "deger": "{{payload}}",
  "zaman": "{{timestamp}}"
}`,
}

/** JS yok — JSON payload için (temperature alanı varsa) */
export const PRESET_TEMPLATE_TEMP: WebhookPreset = {
  id: 'template_temp_alarm',
  label: 'Sıcaklık (JS yok, JSON payload)',
  description: 'ESP32 JSON gönderiyorsa (örn. {"temperature":23.5}) şablon yeterli.',
  name: 'Sıcaklık Alarmı',
  topic_pattern: 'ev/+/sicaklik',
  useScript: false,
  useTemplates: true,
  body_template: `{
  "alarm": "sicaklik",
  "oda": "{{topic_parts.1}}",
  "cihaz": "{{sender}}",
  "sicaklik": {{payload.temperature}},
  "nem": {{payload.humidity}},
  "zaman": "{{timestamp}}"
}`,
}

/** Hazır JS — sadece 30°C üzerinde n8n'e gider */
export const PRESET_JS_TEMP_ALARM = {
  id: 'js_temp_alarm' as const,
  label: 'Sıcaklık alarmı (>30°C, hazır JS)',
  description: '30 derecenin altını göndermez. Payload sayı veya JSON olabilir.',
  name: 'Sıcaklık Alarmı',
  topic_pattern: 'ev/+/sicaklik',
  useScript: true,
  useTemplates: false,
  transform_script: `// Hazır script — düzenlemeniz gerekmez
const temp = ctx.parsedPayload?.temperature
  ?? ctx.parsedPayload?.sicaklik
  ?? parseFloat(ctx.payload);

if (Number.isNaN(temp)) {
  log('Geçersiz sıcaklık:', ctx.payload);
  return { skip: true };
}

// Sadece yüksek sıcaklıkta n8n'e gönder
if (temp <= 30) {
  return { skip: true };
}

return {
  body: {
    alarm: 'HIGH_TEMP',
    oda: ctx.topicParts[1] ?? 'bilinmiyor',
    cihaz: ctx.sender,
    sicaklik: temp,
    birim: 'celsius',
    topic: ctx.topic,
    zaman: ctx.timestamp,
  },
};
`,
}

export const WEBHOOK_PRESETS: WebhookPreset[] = [
  PRESET_TEMPLATE_SIMPLE,
  PRESET_TEMPLATE_TEMP,
  PRESET_JS_TEMP_ALARM,
]
