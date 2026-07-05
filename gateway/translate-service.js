import { buildMessages } from './prompt.js';
import { normalizeRequest } from './request.js';
import { getTemperature, loadStyleConfig } from './style-config.js';
import { buildCorrectionMessages, validateCandidate } from './validator.js';

export function createTranslateService({ config, qwenClient, logger = () => {} }) {
  const styleConfig = loadStyleConfig();

  return {
    async translate(body) {
      const input = normalizeRequest(body, config.maxInputChars);
      const model = input.model || config.defaultModel;
      const messages = buildMessages(input);

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
          meta: { corrected: false, action: input.action },
        };
      }

      logger(`correction action=${input.action} reasons=${validation.reasons.join('; ')}`);

      const second = await qwenClient.callChatCompletion({
        ...payload,
        temperature: getTemperature(input.action, true),
        messages: buildCorrectionMessages(input, first.text, validation.reasons, messages),
      });

      return {
        text: second.text,
        model,
        usage: second.usage,
        meta: { corrected: true, action: input.action },
      };
    },
  };
}
