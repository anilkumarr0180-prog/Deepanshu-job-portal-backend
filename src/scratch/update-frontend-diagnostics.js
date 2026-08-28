const fs = require('fs');
const path = require('path');

const clientRoot = path.resolve(__dirname, '../../../client/src');

// 1. Update webrtc.service.ts
const webrtcServicePath = path.join(clientRoot, 'features/call/services/webrtc.service.ts');
let webrtcService = fs.readFileSync(webrtcServicePath, 'utf8');

if (!webrtcService.includes('CallDiagnosticsSession')) {
  webrtcService = webrtcService.replace(
    'import { fetchIceServersApi, type IceServerConfig } from "../api/call.api";',
    'import { fetchIceServersApi, type IceServerConfig } from "../api/call.api";\nimport { CallDiagnosticsSession, classifyMediaError } from "./callDiagnostics";'
  );

  webrtcService = webrtcService.replace(
    'export interface WebRTCCallbacks {',
    'export interface WebRTCCallbacks {\n  diagnostics?: CallDiagnosticsSession;'
  );

  webrtcService = webrtcService.replace(
    'catch (err: any) {',
    `catch (err: any) {
      const { category, userMessage } = classifyMediaError(err);
      this.callbacks.diagnostics?.recordFailure(category, err?.message);
      throw new Error(userMessage);
    }`
  );

  // Hook into peerConnection event listeners
  webrtcService = webrtcService.replace(
    'pc.onicecandidate = (event) => {\n          if (event.candidate) {\n            this.callbacks.onIceCandidate(event.candidate.toJSON());\n          }\n        };',
    `pc.onicecandidate = (event) => {
          if (event.candidate) {
            this.callbacks.diagnostics?.recordCandidate(event.candidate.candidate);
            this.callbacks.onIceCandidate(event.candidate.toJSON());
          }
        };
        pc.onicegatheringstatechange = () => {
          this.callbacks.diagnostics?.recordIceGatheringState(pc.iceGatheringState);
        };
        pc.onsignalingstatechange = () => {
          this.callbacks.diagnostics?.recordSignalingState(pc.signalingState);
        };`
  );

  webrtcService = webrtcService.replace(
    'pc.onconnectionstatechange = () => {\n          if (!this.peerConnection) return;\n          const state = this.peerConnection.connectionState;',
    `pc.onconnectionstatechange = () => {
          if (!this.peerConnection) return;
          const state = this.peerConnection.connectionState;
          this.callbacks.diagnostics?.recordConnectionState(state);`
  );

  webrtcService = webrtcService.replace(
    'pc.oniceconnectionstatechange = () => {\n          if (!this.peerConnection) return;\n          const iceState = this.peerConnection.iceConnectionState;',
    `pc.oniceconnectionstatechange = () => {
          if (!this.peerConnection) return;
          const iceState = this.peerConnection.iceConnectionState;
          this.callbacks.diagnostics?.recordIceState(iceState);`
  );
}

fs.writeFileSync(webrtcServicePath, webrtcService);
console.log('✅ Updated webrtc.service.ts with diagnostics hooks');

// 2. Update CallContext.tsx
const callContextPath = path.join(clientRoot, 'features/call/context/CallContext.tsx');
let callContext = fs.readFileSync(callContextPath, 'utf8');

if (!callContext.includes('CallDiagnosticsSession')) {
  callContext = callContext.replace(
    'import { WebRTCCallService } from "../services/webrtc.service";',
    'import { WebRTCCallService } from "../services/webrtc.service";\nimport { CallDiagnosticsSession } from "../services/callDiagnostics";'
  );

  callContext = callContext.replace(
    '  const webrtcServiceRef = useRef<WebRTCCallService | null>(null);',
    `  const webrtcServiceRef = useRef<WebRTCCallService | null>(null);
  const diagnosticsRef = useRef<CallDiagnosticsSession | null>(null);`
  );

  callContext = callContext.replace(
    '      webrtcServiceRef.current = new WebRTCCallService({',
    `      webrtcServiceRef.current = new WebRTCCallService({
        diagnostics: diagnosticsRef.current || undefined,`
  );

  // Hook diagnostics in initiateCall
  callContext = callContext.replace(
    '    // 1. Acquire microphone stream eagerly',
    `    const diag = new CallDiagnosticsSession(conversationId, "caller");
    diag.recordInitiated();
    diagnosticsRef.current = diag;

    // 1. Acquire microphone stream eagerly`
  );

  // Hook diagnostics in incoming call
  callContext = callContext.replace(
    '    const handleIncoming = (data: {',
    `    const handleIncoming = (data: {
      const diag = new CallDiagnosticsSession(data.callId, "callee");
      diagnosticsRef.current = diag;`
  );

  // Hook diagnostics in acceptCall
  callContext = callContext.replace(
    '    setCallState("CONNECTING");\n    toneGenerator.stop();',
    `    setCallState("CONNECTING");
    toneGenerator.stop();
    diagnosticsRef.current?.recordAccepted();
    diagnosticsRef.current?.recordConnectionStart();`
  );

  // Hook diagnostics in onConnectionStateChange connected
  callContext = callContext.replace(
    '            setCallState("CONNECTED");',
    `            setCallState("CONNECTED");
            diagnosticsRef.current?.recordConnected();`
  );

  // Hook diagnostics in resetCallSession
  callContext = callContext.replace(
    '    toneGenerator.stop();',
    `    toneGenerator.stop();
    diagnosticsRef.current?.recordEnded();`
  );
}

fs.writeFileSync(callContextPath, callContext);
console.log('✅ Updated CallContext.tsx with diagnostics tracking');
