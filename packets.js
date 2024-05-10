/* specific to K250 packets */

class PacketHelper { 
  constructor () {
	this.packetbuffer=[];
    this.escMap = new Map([
	[0x10, 0x10],
	[0x16, 0x30],
	[0x2c, 0x31],
	[0x58, 0x32],
	[0xb0, 0x33],
	[0x61, 0x34],
	[0xc2, 0x35],
	[0x85, 0x36],
	[0x0b, 0x37]
	]);
    this.invMap = new Map([
	[0x10, 0x10],
	[0x30, 0x16],
	[0x31, 0x2c],
	[0x32, 0x58],
	[0x33, 0xb0],
	[0x34, 0x61],
	[0x35, 0xc2],
	[0x36, 0x85],
	[0x37, 0x0b]
	]);
  }
  getEscaped(b) {
    	return this.escMap.get(b);
  }
    
  getOriginal(b) {
    	return this.invMap.get(b);
  }
    
  needsEscaping(b) {
    	return this.escMap.has(b);
  }

  addByteWithEscape(buffer, b) {
	if (this.needsEscaping(b)) {
		buffer.push(0x10);
		buffer.push(this.getEscaped(b));
	} else {
		buffer.push(b);
	}
  }

  buildPacket(rawdata) {
    let result = [0x10,0x02];
    let datasize= rawdata.length;

    let hiB = ((datasize&0xff00)>>8)&0xff;
	let loB = datasize&0xff;

	this.addByteWithEscape(result,hiB);
	this.addByteWithEscape(result,loB);

	let checkSum = new Uint16Array([0]);
	for (let i=0;i<rawdata.length;i++) {
		const x=rawdata[i];
		this.addByteWithEscape(result,x);
		checkSum[0]+=(x&0x00FF);		
	}

	hiB = ((checkSum[0]&0xff00)>>8)&0xff;
	loB = checkSum[0]&0xff;
	
	this.addByteWithEscape(result,hiB);
	this.addByteWithEscape(result,loB);

	return result;
  }

  //building packets
  clearBuffer() {
	this.packetbuffer=[];
  }
  addToBuffer(b) {
	const data=Uint8Array.from(b);
	for (let i=0;i<data.length;i++)
		this.packetbuffer.push(data[i]);
  }
  packetComplete() {
	//console.log("checking: ");//+this.bufferToHex(this.packetbuffer));
	if (this.packetbuffer.length<6) 
		return false; //not long enough
	if (this.packetbuffer[0]!=0x10 || this.packetbuffer[1]!=0x02) 
		return false; //invalid header

	let index = 2;
	let dataSize = 0;
		
	let x = this.packetbuffer[index++]; //size high
	if (x==0x10) {
	  x = this.getOriginal(p[index++]);
	}
	dataSize=x&0xFF;

	x = this.packetbuffer[index++]; //size low
	if (x==0x10) {
		x = this.getOriginal(p[index++]);
	}
	dataSize = (dataSize<<8)+(x&0xFF);
	
	// there must be at least 1 byte for each data + 2 checksum + 2 header
	if (this.packetbuffer.length < (dataSize+2+index)) 
		return false; //too short, can't be done yet

	let myCheckSum=new Uint16Array([0,0]);
	// run through data calculating checksum
	while (dataSize>0) {
		if (index+2>this.packetbuffer.length)
			return false; //would end up out of bounds
		x = this.packetbuffer[index++]; 
		if (x==0x10) {
			if (index+2>this.packetbuffer.length)
				return false; //would end up out of bounds
			x = this.getOriginal(this.packetbuffer[index++]);
		}
		myCheckSum[0]+=(x&0x00FF);
		dataSize--;
	}
	
	//verify checksum
	if (index+1>this.packetbuffer.length)
		return false; //would end up out of bounds
	x = this.packetbuffer[index++]; //check sum size high
	if (x==0x10) {
		if (index+1>this.packetbuffer.length)
			return false; //would end up out of bounds
		x = this.getOriginal(this.packetbuffer[index++]);
	}
	myCheckSum[1]=x&0x00ff; //given high byte
	myCheckSum[1]=myCheckSum[1]<<8;

	if (index+1>this.packetbuffer.length) 
		return false; //would end up out of bounds
	
	x = this.packetbuffer[index++]; //check sum low
	if (x==0x10) {
		if (index+1>this.packetbuffer.length) 
			return false; //would end up out of bounds
		x = this.getOriginal(this.packetbuffer[index++]);
	}
	myCheckSum[1] = myCheckSum[1]+(x&0xff);
	return (myCheckSum[0]==myCheckSum[1]);
  }	
  
  getPacketData() {
	// assuming we passed the packetComplete check
	let result=[];
	let index=2;
	let dataSize=0;

	let x=this.packetbuffer[index++];
	if (x==0x10)
		x = this.getOriginal(this.packetbuffer[index++]);
	dataSize = x&0xFF;

	x = this.packetbuffer[index++]; //size low
	if (x==0x10) 
		x = this.getOriginal(this.packetbuffer[index++]);
	dataSize = (dataSize<<8)+(x&0xFF);

	while (dataSize>0) {
		x = this.packetbuffer[index++];
		if (x==0x10) 
			x = this.getOriginal(this.packetbuffer[index++]);
		result.push(x);
		dataSize--;
	}
	return Uint8Array.from(result);
  }

  bufferToHex (buffer) {
    return [...new Uint8Array (buffer)]
        .map (b => b.toString(16).padStart (2, "0"))
        .join (" ");
  } 
}