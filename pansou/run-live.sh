#!/usr/bin/env bash
# Start PanSou for 盘搜 live aggregation (no Docker required).
set -euo pipefail
cd "$(dirname "$0")"
export PATH="/usr/local/go/bin:${PATH}"

export PORT="${PORT:-8888}"
# Public TG channels from pansou docker-compose defaults (maintainable upstream list)
export CHANNELS="${CHANNELS:-tgsearchers7,Aliyun_4K_Movies,yunpanx,yp123pan,yunpanxunlei,tianyifc,peccxinpd,gotopan,PanjClub,baicaoZY,MCPH02,MCPH03,bdwpzhpd,Q66Share,ucwpzy,shareAliyun,Quark_Movies,XiangxiuNBB,ucquark,xx123pan,yingshifenxiang123,zyfb123,Lsp115,taoxgzy,Channel_Shares_115,vip115hot,wp123zy,yunpan139,yunpan189,yunpanuc,yydf_hzl,leoziyuan,yoyokuakeduanju,TG654TG,QukanMovie,Baidu_netdisk,D_wusun,KaiPanshare,PikPak_Share_Channel,QuarkFree,yunpanNB,pxyunpanxunlei,kuakedongman,Netdisk_Movies,yunpanquark,XunLeiPinDao,baidyunpan,yunpans,SharePanFilms}"

# Explicit plugin enable list (subset of pansou docker-compose; covers multi-cloud search sites)
export ENABLED_PLUGINS="${ENABLED_PLUGINS:-pansearch,hunhepan,pan365,aipan,leso,sousou,yingso,yunso,yunsou,xiaokupan,panlian,quarksoo,quarktv,quark4k,duoduo,labi,muou,shandian,zhizhen,ouge,wanou,feikuai,kkv,libvio,hdmoli,weibo,qqpd}"

export CACHE_PATH="${CACHE_PATH:-./cache}"
export ASYNC_PLUGIN_ENABLED="${ASYNC_PLUGIN_ENABLED:-true}"
export ASYNC_RESPONSE_TIMEOUT="${ASYNC_RESPONSE_TIMEOUT:-6}"
export PLUGIN_TIMEOUT="${PLUGIN_TIMEOUT:-30}"
# Leave PROXY unset by default; set PROXY=socks5://... only if TG is blocked.

mkdir -p "$CACHE_PATH"
echo "[pansou] starting on :$PORT"
echo "[pansou] CHANNELS count=$(echo "$CHANNELS" | tr ',' '\n' | wc -l)"
echo "[pansou] ENABLED_PLUGINS count=$(echo "$ENABLED_PLUGINS" | tr ',' '\n' | wc -l)"
echo "[pansou] PROXY=${PROXY:-(none)}"
exec ./pansou
