# Pasta de entrada

Coloque aqui, a cada fechamento, os arquivos exportados:

| Arquivo | Como reconhecer | Obrigatório |
| --- | --- | --- |
| Pedidos do dia (Cora) | `.csv` com as colunas "Número pedido", "Cód. unidade venda", "Data entrada"… (qualquer nome, ex.: `Pedidos_Cora.csv`) | Para a vespertina |
| Pedidos faturados do mês (Promax) — **lido direto da rede** em `Z:\VENDAS\APR\Power BI\Fato\03.02.37` (vale o mais recente entre a rede e esta pasta) | `.csv` que começa com "Empresa;Filial;…" e tem a coluna "Nota" (qualquer nome, ex.: `03.02.37.csv`) | Para o painel do mês e para o acumulado da vespertina |
| Tarefas BEES Force | `.xlsx` com "bees" ou "tarefa" no nome — **um por revenda ou grupo**, todos são lidos (ex.: `fBeesForce202611Guarabira.xlsx`, `fBeesForce202611Patos_Sumé.xlsx`, `fBeesForce202611Sousa_Itaporanga.xlsx`) | Sim |
| Tarefas de Long Neck (BEES) | `.xlsx` com "LongNeck" no nome (ex.: `fLongNeck202611.xlsx`): as tarefas da cesta LN HE | Recomendado (sem ele, a LN HE sai pelo texto) |
| Cesta de produtos | `.xlsx` com "cesta" no nome | Só quando mudar (fica a última usada em `base/`) |

- Pedidos e faturados: se houver mais de um arquivo do mesmo tipo, vale o mais recente.
- Tarefas: todos os arquivos são lidos. Se dois trouxerem a mesma revenda, vale o mais recente.
- O faturado também alimenta a vespertina: as tarefas mensais somam o que o PDV já faturou no mês com o pedido do dia.

Nada desta pasta vai para o Git nem para o site: só o resultado calculado é publicado.
