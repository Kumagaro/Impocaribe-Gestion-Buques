import type { NetworkInterfaceInfo } from 'node:os';
import { describe, expect, it } from 'vitest';
import { lanInterface } from './facts.ts';

// T126 y T127 · RF-INS-03.2: la red que se comprueba (y que va en el QR) es la de los dispositivos, no una VPN ni el
// adaptador de una máquina virtual, aunque también tengan IPv4.
const ipv4 = (address: string, internal = false): NetworkInterfaceInfo => ({
  address,
  netmask: '255.255.255.0',
  family: 'IPv4',
  mac: '00:00:00:00:00:00',
  internal,
  cidr: `${address}/24`,
});

describe('red de la PC servidor', () => {
  it('salta la VPN, VirtualBox, Hyper-V y el lazo local; reconoce el wifi', () => {
    expect(
      lanInterface({
        'Loopback Pseudo-Interface 1': [ipv4('127.0.0.1', true)],
        ProTUN: [ipv4('10.2.0.2')],
        'VirtualBox Host-Only Network': [ipv4('192.168.56.1')],
        'vEthernet (WSL)': [ipv4('172.20.0.1')],
        'Wi-Fi': [ipv4('192.168.1.10')],
      }),
    ).toEqual({ name: 'Wi-Fi', address: '192.168.1.10', wifi: true });
  });

  it('por cable, «Ethernet»; sin ningún adaptador real, ninguna red', () => {
    expect(lanInterface({ Ethernet: [ipv4('192.168.0.5')] })).toEqual({
      name: 'Ethernet',
      address: '192.168.0.5',
      wifi: false,
    });
    expect(lanInterface({ ProTUN: [ipv4('10.2.0.2')], 'Conexión de red Bluetooth': [ipv4('169.254.1.1')] })).toBeNull();
  });
});
