import { buildMessages } from './prompt.js';
import { normalizeRequest } from './request.js';
import { getTemperature, loadStyleConfig } from './style-config.js';
import {
  buildEnRuCorrectionMessages,
  buildCorrectionMessages,
  validateCandidate,
  validateEnRuTranslation,
} from './validator.js';

const EN_RU_TEMPERATURE = 0.22;
const EN_RU_CORRECTION_TEMPERATURE = 0.2;
const EN_RU_MAX_TOKENS = 1400;

export function createTranslateService({ config, qwenClient, logger = () => {} }) {
  const styleConfig = loadStyleConfig();

  async function translateRuEn(input, model, messages) {
    const payload = {
      model,
      messages,
      stream: false,
      temperature: getTemperature(input.action),
      max_tokens: 360,
    };

    const first = await qwenClient.callChatCompletion(payload);
    const validation = validateCandidate(first.text, input, styleConfig);

    if (validation.ok) {
      return {
        text: first.text,
        model,
        usage: first.usage,
        meta: { direction: input.direction, corrected: false, action: input.action },
      };
    }

    logger(`correction direction=${input.direction} action=${input.action} reasons=${validation.reasons.join('; ')}`);

    const second = await qwenClient.callChatCompletion({
      ...payload,
      temperature: getTemperature(input.action, true),
      messages: buildCorrectionMessages(input, first.text, validation.reasons, messages),
    });

    return {
      text: second.text,
      model,
      usage: second.usage,
      meta: { direction: input.direction, corrected: true, action: input.action },
    };
  }

  async function translateEnRu(input, model, messages) {
    const payload = {
      model,
      messages,
      stream: false,
      temperature: EN_RU_TEMPERATURE,
      max_tokens: EN_RU_MAX_TOKENS,
    };

    const first = await qwenClient.callChatCompletion(payload);
    const validation = validateEnRuTranslation(first.text, input.text);

    if (validation.ok) {
      return {
        text: first.text,
        model,
        usage: first.usage,
        meta: { direction: input.direction, corrected: false, action: input.action },
      };
    }

    logger(`correction direction=${input.direction} action=${input.action} reasons=${validation.reasons.join('; ')}`);

    const second = await qwenClient.callChatCompletion({
      ...payload,
      temperature: EN_RU_CORRECTION_TEMPERATURE,
      messages: buildEnRuCorrectionMessages(messages, first.text),
    });

    return {
      text: second.text,
      model,
      usage: second.usage,
      meta: { direction: input.direction, corrected: true, action: input.action },
    };
  }

  return {
    async translate(body) {
      const input = normalizeRequest(body, config.maxInputChars);
      const model = input.model || config.defaultModel;
      const messages = buildMessages(input);

      return input.direction === 'en-ru'
        ? translateEnRu(input, model, messages)
        : translateRuEn(input, model, messages);
    },
  };
}
