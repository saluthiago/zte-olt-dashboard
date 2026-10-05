# OLT.OPS 1.0 — implantação no Debian com Nginx

## 1. O que é este sistema

O OLT.OPS 1.0 é uma aplicação web full-stack composta por **React 19 + TypeScript + Tailwind CSS** no navegador e **Node.js + Express + tRPC** no servidor. O armazenamento usa **MySQL/TiDB via Drizzle ORM**. A comunicação com a ZTE C300 usa **SNMP v2c sobre UDP** para telemetria e **Telnet sobre TCP** para comandos operacionais.

A aplicação coleta o inventário e o estado real da OLT, enriquece sinal RX/distância/descrição, detecta ONUs offline, autoriza ONU, desativa com `disable`, reinicia no contexto `pon-onu-mng` e desautoriza com `no onu` no contexto da PON.

## 2. Requisitos do Debian

Use Debian 12 ou superior, com acesso root/sudo. Instale Node.js 22, pnpm, Git, Nginx e MySQL/MariaDB:

```bash
sudo apt update
sudo apt install -y nginx git curl build-essential mariadb-server
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable
sudo corepack prepare pnpm@10.4.1 --activate
node --version
pnpm --version
```

## 3. Banco de dados

```bash
sudo mariadb
```

```sql
CREATE DATABASE zte_olt CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'olt_user'@'127.0.0.1' IDENTIFIED BY 'TROQUE_ESSA_SENHA';
GRANT ALL PRIVILEGES ON zte_olt.* TO 'olt_user'@'127.0.0.1';
FLUSH PRIVILEGES;
EXIT;
```

## 4. Copiar e compilar o projeto

```bash
git clone SEU_REPOSITORIO zte-olt-dashboard
cd zte-olt-dashboard
pnpm install
cp .env.example .env
nano .env
pnpm db:push
pnpm check
pnpm test
pnpm build
```

Preencha no `.env` os dados da OLT. Nunca publique senha Telnet, comunidade SNMP ou `JWT_SECRET` no Git. O exemplo abaixo deve ser adaptado:

```dotenv
NODE_ENV=production
PORT=3000
DATABASE_URL=mysql://olt_user:TROQUE_ESSA_SENHA@127.0.0.1:3306/zte_olt
JWT_SECRET=gere-um-segredo-longo-e-aleatorio
OLT_ZTE_HOST=45.162.123.46
OLT_ZTE_SNMP_PORT=7361
OLT_ZTE_TELNET_PORT=7326
OLT_ZTE_SNMP_COMMUNITY=COMUNIDADE_SNMP
OLT_ZTE_TELNET_USERNAME=USUARIO_TELNET
OLT_ZTE_TELNET_PASSWORD=SENHA_TELNET
OLT_ZTE_BOARDS=8:8,9:16
```

A porta SNMP `7361` deve estar encaminhada até UDP/161 da OLT, conforme a sua regra de NAT. A porta Telnet `7326` deve chegar ao serviço Telnet da C300. Teste antes de iniciar a aplicação:

```bash
nc -vz 45.162.123.46 7326
nc -vzu 45.162.123.46 7361
```

## 5. Serviço systemd

Crie `/etc/systemd/system/olt-ops.service`:

```ini
[Unit]
Description=OLT.OPS ZTE Command Center 1.0
After=network-online.target mariadb.service
Wants=network-online.target

[Service]
Type=simple
User=oltops
Group=oltops
WorkingDirectory=/opt/zte-olt-dashboard
EnvironmentFile=/opt/zte-olt-dashboard/.env
ExecStart=/usr/bin/node /opt/zte-olt-dashboard/dist/index.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd --system --home /opt/zte-olt-dashboard --shell /usr/sbin/nologin oltops
sudo chown -R oltops:oltops /opt/zte-olt-dashboard
sudo systemctl daemon-reload
sudo systemctl enable --now olt-ops
sudo systemctl status olt-ops
journalctl -u olt-ops -f
```

## 6. Nginx e domínio

Copie `deploy/nginx/olt.manianet.com.br.conf` para `/etc/nginx/sites-available/`, crie o link e valide:

```bash
sudo cp deploy/nginx/olt.manianet.com.br.conf /etc/nginx/sites-available/olt.manianet.com.br
sudo ln -s /etc/nginx/sites-available/olt.manianet.com.br /etc/nginx/sites-enabled/olt.manianet.com.br
sudo nginx -t
sudo systemctl reload nginx
```

No DNS, crie um registro `A` para `olt.manianet.com.br` apontando para o IP público do Debian. Depois emita TLS com Certbot:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d olt.manianet.com.br
sudo systemctl status certbot.timer
```

## 7. Atualizações futuras

```bash
cd /opt/zte-olt-dashboard
git pull
pnpm install
pnpm db:push
pnpm check && pnpm test && pnpm build
sudo chown -R oltops:oltops /opt/zte-olt-dashboard
sudo systemctl restart olt-ops
```

## 8. Segurança de produção

Restrinja o acesso ao Telnet/SNMP por firewall e VLAN de gerência. Não exponha as portas `7326` ou `7361` na Internet. Prefira uma VPN ou ACL permitindo somente o IP do servidor. Troque as credenciais padrão, use TLS no domínio, faça backup do banco e limite o acesso ao menu Users a administradores.

O menu **Users** da interface 1.0 cadastra perfis de administrador, operador e técnico; o perfil técnico é apresentado como limitado ao tempo real. O acesso da versão atual é feito pelo login local com usuário e senha, protegido por cookie assinado.


## 9. Arquivos, linguagem e protocolos

Arquivos principais entregues:

- `client/src/pages/Home.tsx`: dashboard, formulários de operação, Users, Interfaces/VLANs/IPs, logs locais e identidade visual.
- `client/src/index.css`: tokens da paleta XtremNet (azul-noite, ciano e magenta).
- `server/zteAdapter.ts`: Telnet, SNMP, parser de estado, MAC, sinal RX, distância, status LOS/Dying Gasp e comandos ZTE.
- `server/routers.ts`: contratos tRPC entre navegador e servidor.
- `deploy/nginx/olt.manianet.com.br.conf`: proxy reverso Nginx.
- `docs/DEPLOY_DEBIAN.md`: este passo a passo.

A linguagem do frontend e backend é **TypeScript**. O navegador usa React 19, o servidor usa Node.js/Express/tRPC e o build de produção fica em `dist/`. A telemetria usa **SNMP v2c sobre UDP** (na sua instalação, porta externa 7361 encaminhada para UDP/161) e os comandos usam **Telnet sobre TCP/7326**. O dashboard consulta estado a cada 5 segundos e, depois de autorizar, desautorizar, reboot, ativar, desativar ou mover uma ONU, dispara leituras imediatas em rajada para capturar estado, MAC, sinal, distância e descrição.

### MAC e estados sem energia

O parser tenta ler `MAC address`, `MAC` ou `Mac address` no `show gpon onu detail-info`. Para ONUs offline, o evento diferencia `LOS` (fibra desconectada), `DyingGasp` (perda de energia) e offline genérico. A OLT precisa expor esses campos no retorno Telnet; se o firmware não os fornecer, a tela mostra `não informado`.

### Onde ficam os dados locais da interface

Nesta versão, templates, perfis de OLT, interfaces/VLANs/IPs e logo ficam no `localStorage` do navegador. Usuários e logs de operação ficam persistidos no MySQL; senhas são armazenadas somente com hash scrypt e salt.

### Instalação sem Git

Se você receber um ZIP em vez de um repositório, copie a pasta completa para `/opt/zte-olt-dashboard`, incluindo `package.json`, `pnpm-lock.yaml`, `client/`, `server/`, `shared/`, `drizzle/`, `deploy/`, `docs/` e `.env`. Depois execute os mesmos comandos de `pnpm install` até `pnpm build`. Não copie `node_modules` nem `dist` de outro sistema.

### Verificação final

```bash
curl -I http://127.0.0.1:3000
sudo systemctl status olt-ops --no-pager
sudo nginx -t
# Teste a partir do servidor Debian:
nc -vz 45.162.123.46 7326
nc -vzu 45.162.123.46 7361
```

Antes de liberar o domínio, confirme que o firewall permite somente HTTP/HTTPS para o público e que SNMP/Telnet são acessíveis apenas pelo IP do servidor ou pela VPN de gerência.

## 10. Login local com usuário e senha

A versão 1.0 usa login local por cookie assinado. O OAuth não é necessário para acessar o painel. Defina no `.env` do servidor, sem publicar esses valores:

```dotenv
JWT_SECRET=gere-um-segredo-longo-e-aleatorio
OLT_ADMIN_USERNAME=admin
OLT_ADMIN_PASSWORD=troque-por-uma-senha-forte
OLT_ADMIN_NAME=Administrador
OLT_ADMIN_EMAIL=admin@manianet.com.br
```

Na primeira inicialização, o sistema cria automaticamente o administrador se o usuário ainda não existir. A senha é armazenada com scrypt e salt. Para aplicar:

```bash
cd /opt/zte-olt-dashboard
nano .env
runuser -u oltops -- pnpm build
systemctl restart olt-ops
systemctl status olt-ops --no-pager
```

Depois entre no domínio usando o usuário e a senha definidos no `.env`. Usuários adicionais podem ser cadastrados no menu **Users** pelo administrador.
