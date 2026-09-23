// Fills in a real THREEx.DeviceOrientationControls — AR.js's aframe-ar.js
// bundle references this class (inside arjs-device-orientation-controls,
// auto-attached by gps-new-camera on every mobile device) but never actually
// exposes it as a global. That throws "THREEx is not defined" the instant
// gps-new-camera tries to use it, aborting the rest of gps-new-camera's own
// init() — which is why originCoords/GPS-watch setup silently never ran on
// mobile at all, independent of GPS accuracy. This is the standard/expected
// workaround (the same DeviceOrientationControls implementation three.js
// itself used to ship): load this BEFORE aframe-ar.js.
(function () {
  var THREE = window.AFRAME && window.AFRAME.THREE;
  if (!THREE) return; // aframe.js must load before this file

  function DeviceOrientationControls(object) {
    var scope = this;
    this.object = object;
    this.object.rotation.reorder('YXZ');
    this.enabled = true;
    this.deviceOrientation = {};
    this.screenOrientation = 0;
    this.alphaOffset = 0;

    var onDeviceOrientationChangeEvent = function (event) {
      scope.deviceOrientation = event;
    };
    var onScreenOrientationChangeEvent = function () {
      scope.screenOrientation = window.orientation || 0;
    };

    var setObjectQuaternion = (function () {
      var zee = new THREE.Vector3(0, 0, 1);
      var euler = new THREE.Euler();
      var q0 = new THREE.Quaternion();
      var q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
      return function (quaternion, alpha, beta, gamma, orient) {
        euler.set(beta, alpha, -gamma, 'YXZ');
        quaternion.setFromEuler(euler);
        quaternion.multiply(q1);
        quaternion.multiply(q0.setFromAxisAngle(zee, -orient));
      };
    })();

    this.connect = function () {
      onScreenOrientationChangeEvent();
      window.addEventListener('orientationchange', onScreenOrientationChangeEvent, false);
      window.addEventListener('deviceorientation', onDeviceOrientationChangeEvent, false);
      scope.enabled = true;
    };
    this.disconnect = function () {
      window.removeEventListener('orientationchange', onScreenOrientationChangeEvent, false);
      window.removeEventListener('deviceorientation', onDeviceOrientationChangeEvent, false);
      scope.enabled = false;
    };
    this.update = function () {
      if (scope.enabled === false) return;
      var device = scope.deviceOrientation;
      if (device) {
        var alpha = device.alpha ? THREE.MathUtils.degToRad(device.alpha) + scope.alphaOffset : 0;
        var beta = device.beta ? THREE.MathUtils.degToRad(device.beta) : 0;
        var gamma = device.gamma ? THREE.MathUtils.degToRad(device.gamma) : 0;
        var orient = scope.screenOrientation ? THREE.MathUtils.degToRad(scope.screenOrientation) : 0;
        setObjectQuaternion(scope.object.quaternion, alpha, beta, gamma, orient);
      }
    };
    this.dispose = function () { scope.disconnect(); };

    this.connect();
  }

  window.THREEx = window.THREEx || {};
  window.THREEx.DeviceOrientationControls = DeviceOrientationControls;
})();
