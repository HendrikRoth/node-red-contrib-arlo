var Arlo = require('node-arlo')

module.exports = function(RED) {
  var services = {}

  RED.httpAdmin.get('/arlo/devices', function(req, res, next) {
	var id = req.query.service
	var deviceType = req.query.type || 'basestation'
	var service = services[id]
	service.arlo.on('got_devices', function(resp) {
		var devices = []
		Object.keys(resp).forEach(function(key) {
			var device = resp[key]
			if (device.getType() === deviceType) {
				devices.push({
					name: device.getName(),
					model: device.getModel(),
					id: device.getSerialNumber()
				})
			}
		})
		res.end(JSON.stringify(devices))
	})
	service.arlo.getDevices()
  })

  function ArloConfig(config) {
    var self = this
    RED.nodes.createNode(self, config)

    self.config = {
		name: config.name
    }
	self.arlo = new Arlo()

    self.arlo.on('got_devices', function() {
		services[self.id] = self
		updateStatus('ready')
    })

	self.init = function() {
		updateStatus('init')
		self.arlo.login(self.credentials.username, self.credentials.password)
	}

    var updateStatus = function(status) {
		self.state = status

		switch(status) {
			case 'init':
				self.emit('statusUpdate', {
					fill: 'yellow',
					shape: 'ring',
					text: 'Initializing service..'
				})
				break;
			case 'ready':
				self.emit('statusUpdate', {
					fill: 'green',
					shape: 'dot',
					text: 'Ready'
				})
				break;
			case 'error':
				self.emit('statusUpdate', {
					fill: 'red',
					shape: 'ring',
					text: 'Error'
				})
				break;
		}
    }

	self.init()
  }

	RED.nodes.registerType('arlo-config', ArloConfig, {
		credentials: {
			username: {
				type: 'text'
			},
			password: {
				type: 'password'
			}
		}
	})

	function ArloOut(n) {
		var self = this
		RED.nodes.createNode(self, n)
		self.config = RED.nodes.getNode(n.service)

		self.on('input', function(msg) {
			if (self.config.state === 'ready' && self.config.arlo) {

				var device = self.config.arlo.devices[n.device]

				if (msg.payload) {
					device.arm(function(body) {
						if (!body.success) {
							self.error(body)
						} else {
							self.send(msg)
						}
					})
				} else {
					device.disarm(function(body) {
						if (!body.success) {
							self.error(body)
						} else {
							self.send(msg)
						}
					})
				}

			} else {
				self.error('Service not ready')
				self.config.init()
			}
		})

		self.on('close', function() {
			self.config.removeListener('statusUpdate', self.status)
		})
	}

	RED.nodes.registerType('arlo-out', ArloOut)

	function ArloIn(n) {
		var self = this
		var actions = {
			'state-changed': 'stateChanged',
			'motion-detected': 'motionDetected'
		}

		RED.nodes.createNode(self, n)
		self.config = RED.nodes.getNode(n.service)

		self.config.on('statusUpdate', function() {
			if (self.config.state === 'ready' && self.config.arlo) {
				var device = self.config.arlo.devices[n.device]
				if (device) {
					var msg = {}

					if (n.action === 'state-change') {
						device.on('mode0', function() {
							// disarmed
							msg.payload = false
							self.send(msg)
						})
						device.on('mode1', function() {
							// armed
							msg.payload = true
							self.send(msg)
						})
					} else {
						device.on(actions[n.action], function(msg) {
							self.send(msg)
						})
					}
				}
			}
		})

		self.on('close', function() {
			self.config.removeListener('statusUpdate', self.status)
		})
	}

	RED.nodes.registerType('arlo-in', ArloIn)

	function ArloStream(n) {
		var self = this
		RED.nodes.createNode(self, n)
		self.config = RED.nodes.getNode(n.service)

		self.on('input', function(msg) {
			if (self.config.state === 'ready' && self.config.arlo) {

				var device = self.config.arlo.devices[n.device]

				if (msg.payload) {
					device.getStream(function(error, response) {
						if (error) {
							self.error(error)
						} else {
							msg.payload = response.body.data.url
							self.send(msg)
						}
					})
				}

			} else {
				self.error('Service not ready')
				self.config.init()
			}
		})

		self.on('close', function() {
			self.config.removeListener('statusUpdate', self.status)
		})
	}

	RED.nodes.registerType('arlo-stream', ArloStream)

	function ArloSnapshot(n) {
		var self = this
		RED.nodes.createNode(self, n)
		self.config = RED.nodes.getNode(n.service)

		self.on('input', function(msg) {
			if (self.config.state === 'ready' && self.config.arlo) {

				var device = self.config.arlo.devices[n.device]
				device.on('fullFrameSnapshotAvailable', function(url) {
					msg.payload = url
					self.send(msg)
				})

				if (msg.payload) {
					device.getSnapshot(function(error, response, body) {
						if (error) {
							self.error(error)
						}
					})
				}

			} else {
				self.error('Service not ready')
				self.config.init()
			}
		})

		self.on('close', function() {
			self.config.removeListener('statusUpdate', self.status)
		})
	}

	RED.nodes.registerType('arlo-snapshot', ArloSnapshot)
}
