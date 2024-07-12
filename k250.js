class K250Interface {
    /*
    messageTypes
      0: "Uncategorized",
      1: "Connected",
      2: "Disconnected",
      3: "PacketRX"
      4: "PacketTX"
    */
    packets = new PacketHelper();
    constructor() {
        if (!navigator.serial) {
            console.log("K250 Interface - Serial Not Available");
            this.isSupported = false;
            return;
        }
        this.isSupported = true;
        console.log("K250 Interface - Serial API available");

        // class properties:
        this.port=null;
        this.isConnected=false;
        this.expecting = 0;
        this.inTextBuffer;
        this.outData=[];

        //define events
        this.errMsg = { data: null };
        this.errorEvent = new CustomEvent('errmsg', {
           detail: this.errMsg,
           bubbles: true
        });

        this.appMsg = { type: null, data: null };
        this.appMsgEvent = new CustomEvent('appmsg', {
           detail: this.appMsg,
           bubbles: true
        })

        //for adding event listeners
        this.on = (message, handler) => { parent.addEventListener(message, handler); };

        //these are when devices are plugged in or disconnected
        navigator.serial.addEventListener("connect", this.deviceConnect);
        navigator.serial.addEventListener("disconnect", this.deviceDisconnect);
    }

    handleData(data) {
      //console.log("expecting: "+this.expecting+" RX:"+data);

      // cases 1-5 expect text ending with "<" keep building until we get it 
      if (this.expecting>0 && this.expecting<10) {
        const inText=new TextDecoder().decode(data);
        this.inTextBuffer += inText;
        if (!this.inTextBuffer.endsWith("<")) { 
          return; 
        }
        this.inTextBuffer = this.inTextBuffer.slice(0, -1); 
      }

      switch (this.expecting) {
        case 1: //board info
          // should do a comparison here for version
          this.appMsg.data = this.inTextBuffer;
          this.appMsg.type = 1;
          this.expecting = 0;
          parent.dispatchEvent(this.appMsgEvent);    
          break;
        case 2: //OK< no further action
          this.expecting = 0;
          break;
        case 3: //OK then send P+getConfigPacket
          this.expecting = 4; // OK, then get packet
          let send = new Uint8Array(this.outData);
          this.createAndSendPacket(send);
          break;
        case 4: //OK, then send GetPacket
          const outData = new Uint8Array([71]); //G
          this.packets.clearBuffer();
          this.expecting = 10; //binary data
          this.sendSerial(outData);
          break;
        case 5: //OK, then ready for more
          this.appMsg.data = this.inTextBuffer;
          this.appMsg.type = 4;
          parent.dispatchEvent(this.appMsgEvent);    
          break;
        case 10:  //this will be packet data
          //const txt = this.bufferToHex(data);
          //console.log(txt);
          this.packets.addToBuffer(data);
          if (this.packets.packetComplete()) {
            //console.log("Full packet OK");
            this.appMsg.data = this.packets.getPacketData(); // decode data here
            this.appMsg.type = 3;
            //this.expecting = 0;  this is only true for config
            parent.dispatchEvent(this.appMsgEvent);    
          }
          break;
        default:
          this.appMsg.data = "RX: "+inText;
          this.appMsg.type = 0;
          parent.dispatchEvent(this.appMsgEvent);    
      }
    }

    linkResync() {
      this.expecting=2; //look for OK, no further action
      const out = new Uint8Array([82]);
      this.sendSerial(out);
    }

    getConfig() {
      this.expecting=3; //OK, then send get config
      this.outData=[0x00, 0x16, 0x00, 0x06];
      this.sendBegin();
    }

    getFile(bankNumber) { //this will take parameters for different file types
      this.expecting=3;  //OK, then send get file
      this.outData=[0x00, 0x12, 0x00, (bankNumber-1)]; //get DIGI
      this.sendBegin();
    }

    startSendFile(bankNumber) { //this will take parameters for different file types
      this.expecting=3;
      this.outData=[0x00, 0x13, 0x00, (bankNumber-1)]; //set DIGI
      this.sendBegin();
    }

    sendData(fileData) {
      this.expecting=5; //OK, the event ready for more
      const pData=new Uint8Array(fileData);
      this.createAndSendPacket(pData);
    }

    getNextPacket() {
      const outData = new Uint8Array([71]); //G
      this.packets.clearBuffer();
      this.expecting = 10; //binary data
      this.sendSerial(outData);
    }
  
    async sendSerial(data) {
        if (!this.port) return;
        if (this.port.writable) {
          this.inTextBuffer = "";
          const writer = this.port.writable.getWriter();
          const outdata = Uint8Array.from(data);
          writer.write(outdata).then(writer.releaseLock());
        } else {
          console.log("Port is not writable");
        }
      }

    async connect() {
        try {
            const filters = { filters: [{ usbVendorId: 11914, usbProductId: 10 }]};
            this.port = await navigator.serial.requestPort(filters);
            await this.port.open({baudRate: 115200});
            console.log(this.port);
            this.isConnected=true;
            // start the listenForSerial function:
            this.serialReadPromise = this.listenForSerial();
            const outData = new Uint8Array([63]); // 63 is '?'
            this.expecting = 1;//board info
            this.inTextBuffer = "";
            this.sendSerial(outData);
          } catch (err) {
            if (err.message.includes("No port selected")) {
              console.log("No port selected");
            } else {
              this.errMsg.data = "There was an error opening the serial port: "+err;
              parent.dispatchEvent(this.errorEvent);
              console.error("There was an error opening the serial port:", err);
            }
          }      
    }

    async disconnect() {
        if (this.port) {
          // stop the reader, so you can close the port:
          this.reader.cancel();
          // wait for the listenForSerial function to stop:
          await this.serialReadPromise;
          // close the serial port itself:
          await this.port.close();
          // clear the port variable:
          this.port = null;
          this.isConnected=false;
          this.appMsg.data = "Disconnected";
          this.appMsg.type = 2;
          parent.dispatchEvent(this.appMsgEvent);  
        }
    }

    async listenForSerial() {
        if (!this.port) return;
        while (this.port.readable) {
          this.reader = this.port.readable.getReader();
          try {
            const { value, done } = await this.reader.read();
            if (value) {
              this.handleData(value);
            }
            if (done) {
              console.log('end serial listening');
              break;
            }
          } catch (error) {
            // if there's an error reading the port:
            console.log(error);
            this.appMsg.type = 5;
            this.appMsg.data = "Device<br/>Disconnect";
            parent.dispatchEvent(this.appMsgEvent);          
          } finally {
            this.reader.releaseLock();
          }
        }
      }
  // something plugged in
  deviceConnect(event) {
    console.log(event.target);
  }

  // something disconnected
  deviceDisconnect(event) {
    console.log(event.target);
  }

  sendBegin() {
    let outdata=new Uint8Array([66]);//B
    this.sendSerial(outdata);
  }

  createAndSendPacket(pktData) {
    let outdata=new Uint8Array([80]);//P
    this.sendSerial(outdata);
    let rawpacket=this.packets.buildPacket(pktData);
    this.sendSerial(rawpacket);
  }

  //test area
  bufferToHex (buffer) {
    return [...new Uint8Array (buffer)]
        .map (b => b.toString(16).padStart (2, "0"))
        .join (" ");
  }

}