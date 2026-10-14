import * as e from "three";
import { Euler as t, EventDispatcher as n, MathUtils as r, Quaternion as i, Vector3 as a } from "three";
//#region lib/three/event-emitter.ts
var o = class {
	constructor() {
		this.emit = (e, ...t) => {
			this.eventHandlers[e]?.forEach((e) => {
				e(...t);
			});
		}, this.off = (e, t) => {
			if (this.eventHandlers[e]) {
				let n = this.eventHandlers[e].indexOf(t);
				n > -1 && this.eventHandlers[e].splice(n, 1);
			}
		}, this.eventHandlers = {};
	}
	on(e, t) {
		this.eventHandlers[e] === void 0 && (this.eventHandlers[e] = []), this.eventHandlers[e].push(t);
	}
}, s = class extends o {
	#e;
	constructor({ cameraOptions: t, canvas: n, gpsOptions: r, videoConstraints: i, deviceOrientationOptions: a, serverLogger: o, projection: s, threeObjects: c, dimensionsProvider: u }) {
		if (c && t) throw Error("LocAR.App: ERROR: can only specify one of cameraOptions and threeObjects");
		super(), this.dimensionsProvider = u;
		let { width: d, height: f } = this.#t(), p = d / f;
		this.origHfov = c?.camera ? l.vtoh(c.camera.fov, p) : t?.hFov || 80, this.cameraFeedDimensions = null, this.camera = c?.camera || new e.PerspectiveCamera(l.htov(this.origHfov, p), p, t?.near || .001, t?.far || 1e3), this.scene = c?.scene || new e.Scene(), c ? this.renderer = c.renderer : (n ? (this.renderer = new e.WebGLRenderer({
			canvas: n,
			alpha: !0
		}), this.renderer.setClearColor(65280, 0)) : (this.renderer = new e.WebGLRenderer({ alpha: !0 }), this.renderer.setClearColor(65280, 0), this.renderer.domElement.style.position = "relative", this.renderer.domElement.style.zIndex = "999", document.body.appendChild(this.renderer.domElement)), this.renderer.setSize(d, f), this.renderer.setAnimationLoop(() => {
			this.deviceOrientationControls?.update(), this.renderer.render(this.scene, this.camera);
			let e = this.#e?.raycast(this.camera, this.scene) ?? [];
			e.length > 0 && this.emit("objectsIntersected", { intersections: e });
		}), window.addEventListener("resize", () => {
			let { width: e, height: t } = this.#t();
			this.renderer.setSize(e, t), this.camera.aspect = e / t, this.syncFovWithWebcam(this.camera.aspect);
		}));
		let m = a || { enabled: !0 };
		this.locar = new l(this.scene, this.camera, r, o, s), this.webcam = new w(i), this.deviceOrientationControls = m.enabled === !0 ? new S(this.camera, m) : null, this.#e = null;
	}
	start() {
		return new Promise((e, t) => {
			this.webcam.on("webcamstarted", (e) => {
				let t = e.videoWidth > e.videoHeight;
				this.cameraFeedDimensions = {
					landWidth: t ? e.videoWidth : e.videoHeight,
					landHeight: t ? e.videoHeight : e.videoWidth
				};
				let { width: n, height: r } = this.#t();
				this.matchFovToWebcam(e.videoWidth, e.videoHeight, n / r), this.camera.updateProjectionMatrix(), this.emit("webcamstarted", {
					...e,
					landVideoWidth: this.cameraFeedDimensions.landWidth,
					landVideoHeight: this.cameraFeedDimensions.landHeight
				});
			}), this.webcam.on("webcamerror", (e) => {
				t({
					code: e.code,
					message: e.message
				});
			}), this.deviceOrientationControls === null ? e(this.locar) : (this.deviceOrientationControls?.on("deviceorientationgranted", (t) => {
				t.target.connect(), e(this.locar);
			}), this.deviceOrientationControls.on("deviceorientationerror", (e) => {
				t({
					code: e.code,
					message: e.message
				});
			}), this.deviceOrientationControls.init());
		});
	}
	syncFovWithWebcam(e) {
		if (e === void 0) {
			let { width: t, height: n } = this.#t();
			e = t / n;
		}
		if (this.cameraFeedDimensions !== null) {
			let t = e > 1 ? this.cameraFeedDimensions.landWidth : this.cameraFeedDimensions.landHeight, n = e > 1 ? this.cameraFeedDimensions.landHeight : this.cameraFeedDimensions.landWidth;
			this.matchFovToWebcam(t, n, e);
		}
		this.camera.updateProjectionMatrix();
	}
	matchFovToWebcam(e, t, n) {
		if (n < e / t) {
			let { width: r, height: i } = this.#t(), a = i / t * e, o = l.fovScale(this.origHfov, r / a);
			this.camera.fov = l.htov(o, n);
		} else this.camera.fov = l.htov(this.origHfov, n);
	}
	on(e, t) {
		e == "objectsIntersected" && this.#e === null && (this.#e = new C(this.renderer)), super.on(e, t);
	}
	#t() {
		return this.dimensionsProvider?.() ?? {
			width: window.innerWidth,
			height: window.innerHeight
		};
	}
}, c = class {
	constructor() {
		this.project = (e, t) => [this.#e(e), this.#t(t)], this.unproject = (e) => [this.#n(e[0]), this.#r(e[1])], this.#e = (e) => e / 180 * this.HALF_EARTH, this.#t = (e) => Math.log(Math.tan((90 + e) * Math.PI / 360)) / (Math.PI / 180) * this.HALF_EARTH / 180, this.#n = (e) => e / this.HALF_EARTH * 180, this.#r = (e) => {
			var t = e / this.HALF_EARTH * 180;
			return t = 180 / Math.PI * (2 * Math.atan(Math.exp(t * Math.PI / 180)) - Math.PI / 2), t;
		}, this.getID = () => "epsg:3857", this.EARTH = 40075016.68, this.HALF_EARTH = 20037508.34;
	}
	#e;
	#t;
	#n;
	#r;
}, l = class t extends o {
	#e;
	#t;
	#n;
	#r;
	#i;
	#a;
	#o;
	#s;
	#c;
	constructor(e, t, n = {}, r = null, i = new c()) {
		super(), this.scene = e, this.camera = t, this.#e = i, this.#t = null, this.#n = 0, this.#r = 100, this.#i = null, this.setGpsOptions(n), this.#a = null, this.#o = 0, this.#s = 0, this.#c = r;
	}
	setProjection(e) {
		this.#e = e;
	}
	setGpsOptions(e = {}) {
		e.gpsMinDistance !== void 0 && (this.#n = e.gpsMinDistance), e.gpsMinAccuracy !== void 0 && (this.#r = e.gpsMinAccuracy);
	}
	async startGps() {
		if (this.#c) {
			let e = await (await this.#c.sendData("/gps/start", {
				gpsMinDistance: this.#n,
				gpsMinAccuracy: this.#r
			})).json();
			this.#s = e.session;
		}
		return this.#i === null ? (this.#i = navigator.geolocation.watchPosition((e) => {
			this.#f(e);
		}, (e) => {
			this.emit("gpserror", e);
		}, { enableHighAccuracy: !0 }), !0) : !1;
	}
	stopGps() {
		return this.#i === null ? !1 : (navigator.geolocation.clearWatch(this.#i), this.#i = null, !0);
	}
	fakeGps(e, t, n = null, r = 0) {
		n !== null && this.setElevation(n), this.#f({ coords: {
			longitude: e,
			latitude: t,
			accuracy: r
		} });
	}
	lonLatToWorldCoords(e, t) {
		let n = this.#e.project(e, t);
		return this.eastNorthToWorldCoords(n);
	}
	eastNorthToWorldCoords(e) {
		if (this.#a) e[0] -= this.#a[0], e[1] -= this.#a[1];
		else throw "No initial position determined";
		return [e[0], -e[1]];
	}
	add(e, t, n, r, i = {}) {
		e.properties = i, this.#u(e, t, n, r || 0), this.scene.add(e), this.#c?.sendData("/object/new", {
			position: e.position,
			x: e.position.x,
			z: e.position.z,
			session: this.#s,
			properties: i
		});
	}
	addGeoLine(t, n, r = 1) {
		let i = this.createGeoLine(t, r);
		n.setValues({ side: e.DoubleSide });
		let a = new e.Mesh(i, n);
		return this.scene.add(a), a;
	}
	createGeoLine(t, n = 1) {
		let r = t.map(((t) => {
			let [n, r] = this.lonLatToWorldCoords(t[0], t[1]);
			return new e.Vector3(n, t[2] || 0, r);
		}));
		return this.#l(r, n);
	}
	#l(t, n) {
		let r, i, a, o, s = 0, c = 0, l = [], u, d = t.length - 1, f = [];
		for (let e = 0; e < d; e++) r = t[e + 1].x - t[e].x, i = t[e + 1].z - t[e].z, a = t[e + 1].y - t[e].y, o = Math.sqrt(r * r + a * a + i * i), s = -(n / 2 * i) / o, c = n / 2 * r / o, u = [
			t[e].x - s,
			t[e].y,
			t[e].z - c,
			t[e].x + s,
			t[e].y,
			t[e].z + c
		], e > 0 && u.forEach((e, t) => {
			e = (e + l[t]) / 2;
		}), f.push(...u), l = [
			t[e + 1].x - s,
			t[e + 1].y,
			t[e + 1].z - c,
			t[e + 1].x + s,
			t[e + 1].y,
			t[e + 1].z + c
		];
		f.push(t[d].x - s), f.push(t[d].y), f.push(t[d].z - c), f.push(t[d].x + s), f.push(t[d].y), f.push(t[d].z + c);
		let p = [];
		for (let e = 0; e < d; e++) p.push(e * 2, e * 2 + 1, e * 2 + 2), p.push(e * 2 + 1, e * 2 + 3, e * 2 + 2);
		let m = new e.BufferGeometry(), h = new Float32Array(f);
		return m.setIndex(p), m.setAttribute("position", new e.BufferAttribute(h, 3)), m.computeBoundingBox(), m;
	}
	#u(e, t, n, r) {
		let i = this.lonLatToWorldCoords(t, n);
		r !== void 0 && (e.position.y = r), [e.position.x, e.position.z] = i;
	}
	setElevation(e) {
		this.camera.position.y = e;
	}
	#d(e, t) {
		this.#a = this.#e.project(e, t);
	}
	#f(e) {
		let n = Number.MAX_VALUE;
		this.#o++, this.#c?.sendData("/gps/new", {
			gpsCount: this.#o,
			lat: e.coords.latitude,
			lon: e.coords.longitude,
			acc: e.coords.accuracy,
			session: this.#s
		}), e.coords.accuracy <= this.#r && (this.#t === null ? this.#t = {
			latitude: e.coords.latitude,
			longitude: e.coords.longitude
		} : n = t.haversineDist(this.#t, e.coords), n >= this.#n && (this.#t.longitude = e.coords.longitude, this.#t.latitude = e.coords.latitude, this.#a || (this.#d(e.coords.longitude, e.coords.latitude), this.#c?.sendData("/worldorigin/new", {
			gpsCount: this.#o,
			lat: e.coords.latitude,
			lon: e.coords.longitude,
			session: this.#s,
			initialPosition: this.#a
		})), this.#u(this.camera, e.coords.longitude, e.coords.latitude), this.#c?.sendData("/gps/accepted", {
			gpsCount: this.#o,
			cameraX: this.camera.position.x,
			cameraZ: this.camera.position.z,
			session: this.#s,
			distMoved: n
		}), this.emit("gpsupdate", {
			position: e,
			distMoved: n
		})));
	}
	static haversineDist(t, n) {
		let r = e.MathUtils.degToRad(n.longitude - t.longitude), i = e.MathUtils.degToRad(n.latitude - t.latitude), a = Math.sin(i / 2) * Math.sin(i / 2) + Math.cos(e.MathUtils.degToRad(t.latitude)) * Math.cos(e.MathUtils.degToRad(n.latitude)) * (Math.sin(r / 2) * Math.sin(r / 2));
		return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 6371e3;
	}
	getLastKnownLocation() {
		return this.#t;
	}
	static htov(e, t) {
		return this.fovScale(e, 1 / t);
	}
	static vtoh(e, t) {
		return this.fovScale(e, t);
	}
	static fovScale(e, t) {
		return 2 * Math.atan(t * Math.tan(Math.PI / 180 * (e / 2))) * (180 / Math.PI);
	}
}, u = "locar-device-orientation-permission-modal", d = "locar-device-orientation-permission-button", f = "locar-device-orientation-permission-message", p = "locar-device-orientation-permission-inner", m = "locar-device-orientation-permission-button-inner", h = "This immersive website requires access to your device motion sensors.", g = navigator.userAgent.match(/iPhone|iPad|iPod/i) || /Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints != null && navigator.maxTouchPoints > 1, _ = new a(0, 0, 1), v = new t(), y = new i(), b = new i(-Math.sqrt(.5), 0, 0, Math.sqrt(.5));
2 * Math.PI;
var x = .5 * Math.PI, S = class extends n {
	constructor(e, n = {}) {
		super(), this.init = () => {
			window.DeviceOrientationEvent === void 0 ? this.eventEmitter.emit("deviceorientationerror", {
				code: "LOCAR_DEVICE_ORIENTATION_NOT_SUPPORTED",
				message: "Device orientation API not supported"
			}) : window.isSecureContext === !1 ? this.eventEmitter.emit("deviceorientationerror", {
				code: "LOCAR_DEVICE_ORIENTATION_NO_HTTPS",
				message: "DeviceOrientationEvent is only available in secure contexts (https)"
			}) : typeof window.DeviceOrientationEvent.requestPermission == "function" && this.enablePermissionDialog ? this.obtainPermissionGesture() : this.eventEmitter.emit("deviceorientationgranted", { target: this });
		}, this.eventEmitter = new o();
		let a = this;
		this.object = e, this.object.rotation.reorder("YXZ"), this.enabled = !0, this.deviceOrientation = null, this.screenOrientation = 0, this.alphaOffset = 0, this.orientationOffset = 0, this.initialOffset = null, this.lastQuaternion = null, this.orientationChangeEventName = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation", this.smoothingFactor = n.smoothingFactor || .2, this.enablePermissionDialog = n.enablePermissionDialog ?? !0, this.enableInlineStyling = n.enableStyling ?? !0, this.preferConfirmDialog = n.preferConfirmDialog ?? !1, this.orientationChangeThreshold = n.orientationChangeThreshold ?? 0;
		let s = (t) => {
			let { alpha: n, beta: i, gamma: o, webkitCompassHeading: s } = t;
			if (n ??= 0, i ??= 0, o ??= 0, s ??= 0, g) {
				let e = 360 - s;
				a.alphaOffset = r.degToRad(e - n), a.deviceOrientation = {
					alpha: n,
					beta: i,
					gamma: o,
					webkitCompassHeading: s
				};
			} else n < 0 && (n += 360), a.deviceOrientation = {
				alpha: n,
				beta: i,
				gamma: o
			};
			window.dispatchEvent(new CustomEvent("camera-rotation-change", { detail: { cameraRotation: e.rotation } }));
		}, c = () => {
			a.screenOrientation = window.screen.orientation?.angle ?? 0, g && (a.screenOrientation === 90 ? a.orientationOffset = -x : a.screenOrientation === -90 ? a.orientationOffset = x : a.orientationOffset = 0);
		}, l = (e, t, n, r, i) => {
			v.set(n, t, -r, "YXZ"), e.setFromEuler(v), e.multiply(b), e.multiply(y.setFromAxisAngle(_, -i));
		};
		this.connect = () => {
			c(), window.addEventListener("orientationchange", c), window.addEventListener(a.orientationChangeEventName, s), a.enabled = !0;
		}, this.disconnect = () => {
			window.removeEventListener("orientationchange", c), window.removeEventListener(a.orientationChangeEventName, s), a.enabled = !1, a.initialOffset = !1, a.deviceOrientation = null, a.lastQuaternion = null;
		}, this.requestOrientationPermissions = () => {
			window.DeviceOrientationEvent !== void 0 && typeof window.DeviceOrientationEvent.requestPermission == "function" ? window.DeviceOrientationEvent.requestPermission().then((e) => {
				e === "granted" ? this.eventEmitter.emit("deviceorientationgranted", { target: this }) : this.eventEmitter.emit("deviceorientationerror", {
					code: "LOCAR_DEVICE_ORIENTATION_PERMISSION_DENIED",
					message: "Permission for device orientation denied - AR will not work correctly"
				});
			}).catch((e) => {
				this.eventEmitter.emit("deviceorientationerror", {
					code: "LOCAR_DEVICE_ORIENTATION_PERMISSION_FAILED",
					message: "Permission request for device orientation failed - AR will not work correctly",
					error: JSON.stringify(e, null, 2)
				});
			}) : this.eventEmitter.emit("deviceorientationerror", {
				code: "LOCAR_DEVICE_ORIENTATION_INTERNAL_ERROR",
				message: "Internal error: no requestPermission() found although requestOrientationPermissions() was called - please raise an issue on GitHub"
			});
		}, this.update = () => {
			if (a.enabled === !1) return;
			let e = a.deviceOrientation;
			if (e) {
				let n = e.alpha ? r.degToRad(e.alpha) + a.alphaOffset : 0, o = e.beta ? r.degToRad(e.beta) : 0, s = e.gamma ? r.degToRad(e.gamma) : 0, c = a.screenOrientation ? r.degToRad(a.screenOrientation) : 0, u = new i();
				if (g) {
					l(u, n, o, s, c);
					let i = new t().setFromQuaternion(u, "YXZ");
					i.y = r.degToRad(360 - (e.webkitCompassHeading ?? 0)) + (a.orientationOffset || 0), u.setFromEuler(i);
				} else l(u, n, o, s, c);
				if (a.lastQuaternion && a.orientationChangeThreshold > 0 && u.angleTo(a.lastQuaternion) < a.orientationChangeThreshold) return;
				if (a.smoothingFactor < 1 && a.lastQuaternion) {
					let e = 1 - a.smoothingFactor;
					a.object.quaternion.slerp(u, e);
				} else a.object.quaternion.copy(u);
				a.lastQuaternion = a.object.quaternion.clone(), window.dispatchEvent(new CustomEvent("camera-rotation-change", { detail: { cameraRotation: a.object.rotation } }));
			}
		}, this.getCorrectedHeading = () => {
			let { deviceOrientation: e } = a;
			if (!e) return 0;
			let t = 0;
			return g ? (t = 360 - (e.webkitCompassHeading ?? 0), a.orientationOffset && (t += a.orientationOffset * (180 / Math.PI), t = (t + 360) % 360)) : (e.absolute === !0 || a.orientationChangeEventName, t = e.alpha ? e.alpha : 0, t = (360 - t) % 360, t < 0 && (t += 360)), t;
		}, this.updateAlphaOffset = () => {
			a.initialOffset = !1;
		}, this.dispose = () => {
			a.disconnect();
		}, this.getAlpha = () => {
			let { deviceOrientation: e } = a;
			return e && e.alpha ? r.degToRad(e.alpha) + a.alphaOffset : 0;
		}, this.getBeta = () => {
			let { deviceOrientation: e } = a;
			return e && e.beta ? r.degToRad(e.beta) : 0;
		}, this.getGamma = () => {
			let { deviceOrientation: e } = a;
			return e && e.gamma ? r.degToRad(e.gamma) : 0;
		}, this.createObtainPermissionGestureDialog = () => {
			let e = document.createElement("div");
			e.classList.add(u);
			let t = document.createElement("div");
			t.classList.add(p);
			let n = document.createElement("div");
			n.classList.add(f);
			let r = document.createElement("div");
			r.classList.add(m);
			let i = document.createElement("button");
			i.classList.add(d), document.body.appendChild(e), this.enableInlineStyling === !0 && (e.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'", e.style.display = "flex", e.style.position = "fixed", e.style.zIndex = "100000", e.style.justifyContent = "center", e.style.alignItems = "center", e.style.backgroundColor = "rgba(0,0,0,0.2)", e.style.inset = "0", e.style.padding = "20px", t.style.backgroundColor = "rgba(220, 220, 220, 0.85)", t.style.padding = "6px 0", t.style.borderRadius = "10px", t.style.width = "100%", t.style.maxWidth = "400px", n.style.padding = "10px 12px", n.style.textAlign = "center", n.style.fontWeight = "400", n.style.fontSize = "13px", n.style.display = "flex", n.style.justifyContent = "center", n.style.alignItems = "center", r.style.display = "block", r.style.textAlign = "center", r.style.textDecoration = "none", r.style.borderTop = "rgb(180,180,180) solid 1px", i.style.display = "block", i.style.width = "100%", i.style.textAlign = "center", i.style.appearance = "none", i.style.background = "none", i.style.border = "none", i.style.outline = "none", i.style.padding = "10px", i.style.fontWeight = "400", i.style.fontSize = "16px", i.style.color = "#2e7cf1", i.style.cursor = "pointer"), e.appendChild(t), t.appendChild(n), t.appendChild(r), n.appendChild(document.createTextNode(h)), i.addEventListener("click", () => {
				this.requestOrientationPermissions(), e.style.display = "none";
			}), i.appendChild(document.createTextNode("OK")), r.appendChild(i), document.body.appendChild(e);
		}, this.obtainPermissionGesture = () => {
			this.preferConfirmDialog === !0 ? window.confirm(h) && this.requestOrientationPermissions() : this.createObtainPermissionGestureDialog();
		};
	}
	on(e, t) {
		this.eventEmitter.on(e, t);
	}
}, C = class {
	constructor(t) {
		this.raycaster = new e.Raycaster(), this.normalisedMousePosition = null, t.domElement.addEventListener("click", (n) => {
			let r = t.domElement.getBoundingClientRect();
			this.normalisedMousePosition = new e.Vector2((n.clientX - r.left) / t.domElement.clientWidth * 2 - 1, -((n.clientY - r.top) / t.domElement.clientHeight * 2) + 1);
		});
	}
	raycast(e, t) {
		if (this.normalisedMousePosition !== null) {
			this.raycaster.setFromCamera(this.normalisedMousePosition, e);
			let n = this.raycaster.intersectObjects(t.children, !0);
			return this.normalisedMousePosition = null, n;
		}
		return [];
	}
}, w = class extends o {
	#e;
	constructor(e = { video: { facingMode: "environment" } }, t) {
		super(), t ? this.video = document.querySelector(t) : (this.video = document.createElement("video"), this.video.setAttribute("autoplay", "true"), this.video.setAttribute("playsinline", "true"), this.video.style.cssText += "\n        width: 100%;\n        height: 100%;\n        object-fit: cover;\n        background: black;\n        position: absolute;\n        top: 0px;\n        left: 0px;\n	      z-index: -100;  \n      ", document.body.appendChild(this.video)), this.#e = null, navigator.mediaDevices && navigator.mediaDevices.getUserMedia ? navigator.mediaDevices.getUserMedia(e).then((e) => {
			this.#e = e, this.video?.addEventListener("loadedmetadata", () => {
				this.video.play(), this.emit("webcamstarted", {
					videoWidth: this.video.videoWidth,
					videoHeight: this.video.videoHeight
				});
			}), this.video && (this.video.srcObject = e);
		}).catch((e) => {
			this.emit("webcamerror", {
				code: e.name,
				message: e.message
			});
		}) : this.emit("webcamerror", {
			code: "LOCAR_NO_MEDIA_DEVICES_API",
			message: "Media devices API not supported"
		});
	}
	getVideoDimensions() {
		return `w ${this.video.videoWidth}, h ${this.video.videoHeight}`;
	}
	dispose() {
		(this.#e?.getTracks() ?? []).forEach((e) => {
			e.stop();
		}), this.#e = null, this.video?.remove(), this.video = null;
	}
};
//#endregion
export { s as App, C as ClickHandler, S as DeviceOrientationControls, o as EventEmitter, l as LocAR, c as SphMercProjection, w as Webcam };
