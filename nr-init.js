// Demo settings for the browser agent, shared by every page: session replay, distributed tracing, privacy,
// and performance marks and measures (both off by default in the agent).
// Must load before nr-config.js and nr-agent.js.
;window.NREUM||(NREUM={});NREUM.init={browser_consent_mode:{enabled:false},privacy:{cookies_enabled:true},session_replay:{enabled:true,block_selector:'',mask_text_selector:'*',sampling_rate:10.0,error_sampling_rate:100.0,mask_all_inputs:true,collect_fonts:true,inline_images:false,inline_stylesheet:true,fix_stylesheets:true,preload:false,mask_input_options:{}},distributed_tracing:{enabled:true,exclude_newrelic_header:true},performance:{capture_marks:true,capture_measures:true},ajax:{deny_list:["bam.nr-data.net"],capture_payloads:'none'}};
