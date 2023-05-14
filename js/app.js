async function setup() {
	const patchExportURL = "export/williams_mix.export.json";

	// Create AudioContext
	const WAContext = window.AudioContext || window.webkitAudioContext;
	const context = new WAContext();

	// context.start();
	// Create gain node and connect it to audio output
	const outputNode = context.createGain();
	outputNode.connect(context.destination);
	// Fetch the exported patcher
	let response, patcher;
	try {
		response = await fetch(patchExportURL);
		patcher = await response.json();

		if (!window.RNBO) {
			// Load RNBO script dynamically
			// Note that you can skip this by knowing the RNBO version of your patch
			// beforehand and just include it using a <script> tag
			await loadRNBOScript(patcher.desc.meta.rnboversion);
		}
	} catch (err) {
		const errorContext = {
			error: err,
		};
		if (response && (response.status >= 300 || response.status < 200)) {
			(errorContext.header = `Couldn't load patcher export bundle`),
				(errorContext.description =
					`Check app.js to see what file it's trying to load. Currently it's` +
					` trying to load "${patchExportURL}". If that doesn't` +
					` match the name of the file you exported from RNBO, modify` +
					` patchExportURL in app.js.`);
		}
		if (typeof guardrails === "function") {
			guardrails(errorContext);
		} else {
			throw err;
		}
		return;
	}

	// (Optional) Fetch the dependencies
	let dependencies = [];
	try {
		const dependenciesResponse = await fetch("export/dependencies.json");
		dependencies = await dependenciesResponse.json();

		// Prepend "export" to any file dependenciies
		dependencies = dependencies.map((d) =>
			d.file ? Object.assign({}, d, { file: "export/" + d.file }) : d,
		);
	} catch (e) {}

	// Create the device
	let device;
	try {
		device = await RNBO.createDevice({ context, patcher });
	} catch (err) {
		if (typeof guardrails === "function") {
			guardrails({ error: err });
		} else {
			throw err;
		}
		return;
	}

	// (Optional) Load the samples
	if (dependencies.length)
		await device.loadDataBufferDependencies(dependencies);

	// Connect the device to the web audio graph
	device.node.connect(outputNode);

	// (Optional) Extract the name and rnbo version of the patcher from the description
	document.getElementById("patcher-title").innerText =
		"A Realisation of Williams Mix";

	// (Optional) Automatically create sliders for the device parameters
	makeSliders(device);

	// (Optional) Create a form to send messages to RNBO inputs
	makeInportForm(device);

	// (Optional) Attach listeners to outports so you can log messages from the RNBO patcher
	attachOutports(device);

	// (Optional) Load presets, if any
	loadPresets(device, patcher);

	// (Optional) Connect MIDI inputs
	makeMIDIKeyboard(device);


	document.body.onload = () => {
		// context.start(0);
		context.resume();
	};

	document.body.onclick = () => {
		context.resume();
	};


	// Skip if you're not using guardrails.js
	if (typeof guardrails === "function") guardrails();
}


function loadRNBOScript(version) {
	return new Promise((resolve, reject) => {
		if (/^\d+\.\d+\.\d+-dev$/.test(version)) {
			throw new Error(
				"Patcher exported with a Debug Version!\nPlease specify the correct RNBO version to use in the code.",
			);
		}
		const el = document.createElement("script");
		el.src =
			"https://c74-public.nyc3.digitaloceanspaces.com/rnbo/" +
			encodeURIComponent(version) +
			"/rnbo.min.js";
		el.onload = resolve;
		el.onerror = function (err) {
			console.log(err);
			reject(new Error("Failed to load rnbo.js v" + version));
		};
		document.body.append(el);
	});
}

function makeSliders(device) {
	let pdiv = document.getElementById("rnbo-parameter-sliders");
	let noParamLabel = document.getElementById("no-param-label");
	if (noParamLabel && device.numParameters > 0) pdiv.removeChild(noParamLabel);

	// This will allow us to ignore parameter update events while dragging the slider.
	let isDraggingSlider = false;
	let uiElements = {};

	device.parameters.forEach((param) => {
		// Subpatchers also have params. If we want to expose top-level
		// params only, the best way to determine if a parameter is top level
		// or not is to exclude parameters with a '/' in them.
		// You can uncomment the following line if you don't want to include subpatcher params

		//if (param.id.includes("/")) return;

		// Create a label, an input slider and a value display
		let label = document.createElement("label");
		let slider = document.createElement("input");
		let text = document.createElement("output");
		let sliderContainer = document.createElement("div");
		sliderContainer.appendChild(label);
		sliderContainer.appendChild(slider);
		sliderContainer.appendChild(text);
		

		// Add a name for the label
		label.setAttribute("name", param.name);
		label.setAttribute("for", param.name);
		label.setAttribute("class", "param-label");
		label.textContent = `${param.name}: `;

		// Make each slider reflect its parameter
		slider.setAttribute("type", "range");
		slider.setAttribute("class", "param-slider");
		slider.setAttribute("id", param.id);
		// slider.setAttribute("onchange",getVolValue);
		slider.setAttribute("name", param.name);
		slider.setAttribute("min", param.min);
		slider.setAttribute("max", param.max);
		if (param.steps > 1) {
			slider.setAttribute("step", (param.max - param.min) / (param.steps - 1));
		} else {
			slider.setAttribute("step", (param.max - param.min) / 1000.0);
		}
		slider.setAttribute("value", param.value);

		// Make a settable text input display for the value
		text.setAttribute("value", param.value.toFixed(1));
		text.setAttribute("type", "text");
		text.setAttribute("id", "outputBox");


		// Make each slider control its parameter
		slider.addEventListener("pointerdown", () => {
			isDraggingSlider = true;
		});
		slider.addEventListener("pointerup", () => {
			isDraggingSlider = false;
			slider.value = param.value;
			text.value = param.value.toFixed(1);
		});
		slider.addEventListener("input", () => {
			let value = Number.parseFloat(slider.value);
			param.value = value;
			if(param.id == "L1_VOL"){
				l1Img.style.opacity = value;
				document.querySelector("li .top-left").style.fontSize += toString(value);
			}
			else if (param.id == "L2_VOL"){
				r1Img.style.opacity = value;
				document.querySelector("li .top-right").style.fontSize += toString(value);
			}
			else if (param.id == "R1_VOL"){
				l2Img.style.opacity = value;
				document.querySelector("li .bottom-left").style.fontSize += toString(value);
			}
			else if (param.id == "R2_VOL"){
				r2Img.style.opacity = value;
				document.querySelector("li .bottom-right").style.fontSize += toString(value);

			}
		});

		// Make the text box input control the parameter value as well
		// text.addEventListener("keydown", (ev) => {
		// 	if (ev.key === "Enter") {
		// 		let newValue = Number.parseFloat(text.value);
		// 		if (isNaN(newValue)) {
		// 			text.value = param.value;
		// 		} else {
		// 			newValue = Math.min(newValue, param.max);
		// 			newValue = Math.max(newValue, param.min);
		// 			text.value = newValue;
		// 			param.value = newValue;
		// 		}
		// 	}
		// });
		

		// Store the slider and text by name so we can access them later
		uiElements[param.id] = { slider };

		// Add the slider element
		pdiv.appendChild(sliderContainer);
	});

	// Listen to parameter changes from the device
	device.parameterChangeEvent.subscribe((param) => {
		if (!isDraggingSlider) uiElements[param.id].slider.value = param.value;
		// uiElements[param.id].text.value = param.value.toFixed(1);
	});
}

function makeInportForm(device) {
	const idiv = document.getElementById("rnbo-inports");
	const inportSelect = document.getElementById("inport-select");
	const inportText = document.getElementById("inport-text");
	const inportForm = document.getElementById("inport-form");
	let inportTag = null;

	// Device messages correspond to inlets/outlets or inports/outports
	// You can filter for one or the other using the "type" of the message
	const messages = device.messages;


	const inports = messages.filter(
		(message) => message.type === RNBO.MessagePortType.Inport,
	);
	if (inports.length === 0) {
		idiv.removeChild(document.getElementById("inport-form"));
		return;
	} else {
		idiv.removeChild(document.getElementById("no-inports-label"));
		inports.forEach((inport) => {
			const option = document.createElement("option");
			option.innerText = inport.tag;
			inportSelect.appendChild(option);
		});
		inportSelect.onchange = () => (inportTag = inportSelect.value);
		inportTag = inportSelect.value;

		inportForm.onsubmit = (ev) => {
			// Do this or else the page will reload
			ev.preventDefault();

			// Turn the text into a list of numbers (RNBO messages must be numbers, not text)
			const values = inportText.value.split(/\s+/).map((s) => parseFloat(s));

			// Send the message event to the RNBO device
			let messageEvent = new RNBO.MessageEvent(RNBO.TimeNow, inportTag, values);
			device.scheduleEvent(messageEvent);
		};
	}
}
// 	}
// }

let l1, l2, r1, r2;
const l1Img = document.getElementById("imgL1");
const l2Img = document.getElementById("imgL2");
const r1Img = document.getElementById("imgR1");
const r2Img = document.getElementById("imgR2");

function between(x, min, max) {
	return x >= min && x <= max;
}

function changeSrc(val, img) {
	if (between(val, 0, 0)) {
		img.src = "../export/img/marth_01.png";
	} else if (between(val, 1, 1)) {
		img.src = "../export/img/cloud_01.png";
	} else if (between(val, 2, 7)) {
		img.src = "../export/img/bird_01.png";
	} else if (between(val, 8, 14)) {
		img.src = "../export/img/alarming_01.png";
	} else if (between(val, 15, 22)) {
		img.src = "../export/img/blade_runner_01.png";
	} else if (between(val, 23, 25)) {
		img.src = "../export/img/frog_01.png";
	} else if (between(val, 26, 31)) {
		img.src = "../export/img/konan_01.png";
	} else if (between(val, 32, 43)) {
		img.src = "../export/img/lunar_landing_01.png";
	} else if (between(val, 44, 53)) {
		img.src = "../export/img/nintendo_01.png";
	} else if (between(val, 54, 61)) {
		img.src = "../export/img/nokia_01.png";
	} else if (between(val, 63, 67)) {
		img.src = "../export/img/orchestra_01.png";
	} else if (between(val, 68, 81)) {
		img.src = "../export/img/saxophone_01.png";
	} else if (between(val, 82, 83)) {
		img.src = "../export/img/shut_up_01.png";
	} else if (between(val, 84, 87)) {
		img.src = "../export/img/rickroll_01.png";
	} else if (between(val, 88, 91)) {
		img.src = "../export/img/africa_01.png";
	} else if (between(val, 92, 93)) {
		img.src = "../export/img/dvno_01.png";
	} else if (between(val, 94, 96)) {
		img.src = "../export/img/orchestra_01.png";
	}
}



function attachOutports(device) {
	device.messageEvent.subscribe((ev) => {
		switch (ev.tag) {
			case "left01":
				l1 = Math.floor(ev.payload);
				changeSrc(l1, l1Img);
				// console.log("l1:" + ev.payload);
				break;
			case "left02":
				l2 = Math.floor(ev.payload);
				changeSrc(l2, l2Img);
			// console.log("l2:" + ev.payload);

			case "right01":
				r1 = Math.floor(ev.payload);
				changeSrc(r1, r1Img);
				// console.log("r1:" + ev.payload);
				break;
			case "right02":
				r2 = Math.floor(ev.payload);
				changeSrc(r2, r2Img);
				// console.log("r2:" + ev.payload);
				break;
		}
	});
}


function loadPresets(device, patcher) {
	let presets = patcher.presets || [];
	if (presets.length < 1) {
		document
			.getElementById("rnbo-presets")
			.removeChild(document.getElementById("preset-select"));
		return;
	}
	let presetSelect = document.getElementById("preset-select");
	presets.forEach((preset, index) => {
		const option = document.createElement("option");
		option.innerText = preset.name;
		option.value = index;
	});
}

// console.log(ev);
function makeMIDIKeyboard(device) {
	let mdiv = document.getElementById("rnbo-clickable-keyboard");
	if (device.numMIDIInputPorts === 0) return;

	mdiv.removeChild(document.getElementById("no-midi-label"));

	const midiNotes = [49, 52, 56, 63];
	midiNotes.forEach((note) => {
		const key = document.createElement("div");
		const label = document.createElement("p");
		label.textContent = note;
		key.appendChild(label);
		key.addEventListener("pointerdown", () => {
			let midiChannel = 0;

			// Format a MIDI message paylaod, this constructs a MIDI on event
			let noteOnMessage = [
				144 + midiChannel, // Code for a note on: 10010000 & midi channel (0-15)
				note, // MIDI Note
				100, // MIDI Velocity
			];

			let noteOffMessage = [
				128 + midiChannel, // Code for a note off: 10000000 & midi channel (0-15)
				note, // MIDI Note
				0, // MIDI Velocity
			];

			// Including rnbo.min.js (or the unminified rnbo.js) will add the RNBO object
			// to the global namespace. This includes the TimeNow constant as well as
			// the MIDIEvent constructor.
			let midiPort = 0;
			let noteDurationMs = 250;

			// When scheduling an event to occur in the future, use the current audio context time
			// multiplied by 1000 (converting seconds to milliseconds) for now.
			let noteOnEvent = new RNBO.MIDIEvent(
				device.context.currentTime * 1000,
				midiPort,
				noteOnMessage,
			);
			let noteOffEvent = new RNBO.MIDIEvent(
				device.context.currentTime * 1000 + noteDurationMs,
				midiPort,
				noteOffMessage,
			);

			device.scheduleEvent(noteOnEvent);
			device.scheduleEvent(noteOffEvent);
			key.classList.add("clicked");
		});

		key.addEventListener("pointerup", () => key.classList.remove("clicked"));

		mdiv.appendChild(key);
	});
}

setup();