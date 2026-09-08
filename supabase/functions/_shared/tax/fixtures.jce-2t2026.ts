/**
 * Fixture: demonstrativo do 2º trimestre de 2026 da Jimmy Carvalho Educação Financeira,
 * extraído de `calculo_IRPJ_CSLL_ jce.xlsx` (Wise Contabilidade Digital, 28/07/2026).
 *
 * São os documentos reais que compõem a base — 100 NF-e de mercadoria, 1 devolução,
 * 3 NFS-e de serviço e 1 ganho no exterior. Existe para que a apuração seja testada
 * contra a planilha que ela substitui, inclusive na distribuição de centavos entre
 * linhas (com 100 notas, arredondar cada uma e somar difere de arredondar a soma).
 */

export interface DocFixture {
  doc: string;
  date: string;
  amount: number;
}

export const JCE_2T2026_SAIDAS: DocFixture[] = [
  {
    doc: "NF-e 16269",
    date: "2026-04-01",
    amount: 466.33,
  },
  {
    doc: "NF-e 16270",
    date: "2026-04-01",
    amount: 233.17,
  },
  {
    doc: "NF-e 16271",
    date: "2026-04-01",
    amount: 233.17,
  },
  {
    doc: "NF-e 16272",
    date: "2026-04-03",
    amount: 274.75,
  },
  {
    doc: "NF-e 16273",
    date: "2026-04-04",
    amount: 233.17,
  },
  {
    doc: "NF-e 16274",
    date: "2026-04-05",
    amount: 187.88,
  },
  {
    doc: "NF-e 16275",
    date: "2026-04-05",
    amount: 233.17,
  },
  {
    doc: "NF-e 16276",
    date: "2026-04-07",
    amount: 274.75,
  },
  {
    doc: "NF-e 16277",
    date: "2026-04-10",
    amount: 233.17,
  },
  {
    doc: "NF-e 16278",
    date: "2026-04-10",
    amount: 375.75,
  },
  {
    doc: "NF-e 16279",
    date: "2026-04-15",
    amount: 187.88,
  },
  {
    doc: "NF-e 16280",
    date: "2026-04-15",
    amount: 187.88,
  },
  {
    doc: "NF-e 16281",
    date: "2026-04-15",
    amount: 187.88,
  },
  {
    doc: "NF-e 16282",
    date: "2026-04-15",
    amount: 187.88,
  },
  {
    doc: "NF-e 16283",
    date: "2026-04-16",
    amount: 233.17,
  },
  {
    doc: "NF-e 16284",
    date: "2026-04-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16285",
    date: "2026-04-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16286",
    date: "2026-04-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16287",
    date: "2026-04-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16288",
    date: "2026-04-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16289",
    date: "2026-04-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16290",
    date: "2026-04-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16291",
    date: "2026-04-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16292",
    date: "2026-04-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16293",
    date: "2026-04-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16294",
    date: "2026-04-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16295",
    date: "2026-04-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16296",
    date: "2026-04-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16297",
    date: "2026-04-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16298",
    date: "2026-04-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16299",
    date: "2026-04-16",
    amount: 262.92,
  },
  {
    doc: "NF-e 16300",
    date: "2026-04-17",
    amount: 187.88,
  },
  {
    doc: "NF-e 16301",
    date: "2026-04-17",
    amount: 254.37,
  },
  {
    doc: "NF-e 16302",
    date: "2026-04-17",
    amount: 233.17,
  },
  {
    doc: "NF-e 16303",
    date: "2026-04-17",
    amount: 187.88,
  },
  {
    doc: "NF-e 16304",
    date: "2026-04-18",
    amount: 187.88,
  },
  {
    doc: "NF-e 16305",
    date: "2026-04-18",
    amount: 233.17,
  },
  {
    doc: "NF-e 16306",
    date: "2026-04-26",
    amount: 233.17,
  },
  {
    doc: "NF-e 16307",
    date: "2026-04-28",
    amount: 187.88,
  },
  {
    doc: "NF-e 16308",
    date: "2026-05-03",
    amount: 466.33,
  },
  {
    doc: "NF-e 16309",
    date: "2026-05-05",
    amount: 233.17,
  },
  {
    doc: "NF-e 16310",
    date: "2026-05-05",
    amount: 233.17,
  },
  {
    doc: "NF-e 16311",
    date: "2026-05-10",
    amount: 233.17,
  },
  {
    doc: "NF-e 16312",
    date: "2026-05-12",
    amount: 187.88,
  },
  {
    doc: "NF-e 16313",
    date: "2026-05-13",
    amount: 466.33,
  },
  {
    doc: "NF-e 16314",
    date: "2026-05-15",
    amount: 466.33,
  },
  {
    doc: "NF-e 16315",
    date: "2026-05-15",
    amount: 187.88,
  },
  {
    doc: "NF-e 16316",
    date: "2026-05-15",
    amount: 187.88,
  },
  {
    doc: "NF-e 16317",
    date: "2026-05-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16318",
    date: "2026-05-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16319",
    date: "2026-05-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16320",
    date: "2026-05-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16321",
    date: "2026-05-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16322",
    date: "2026-05-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16323",
    date: "2026-05-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16324",
    date: "2026-05-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16325",
    date: "2026-05-16",
    amount: 262.92,
  },
  {
    doc: "NF-e 16326",
    date: "2026-05-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16327",
    date: "2026-05-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16328",
    date: "2026-05-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16329",
    date: "2026-05-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16330",
    date: "2026-05-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16331",
    date: "2026-05-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16332",
    date: "2026-05-17",
    amount: 254.37,
  },
  {
    doc: "NF-e 16333",
    date: "2026-05-17",
    amount: 233.17,
  },
  {
    doc: "NF-e 16334",
    date: "2026-05-18",
    amount: 187.88,
  },
  {
    doc: "NF-e 16335",
    date: "2026-05-18",
    amount: 233.17,
  },
  {
    doc: "NF-e 16336",
    date: "2026-05-19",
    amount: 187.88,
  },
  {
    doc: "NF-e 16337",
    date: "2026-05-19",
    amount: 187.88,
  },
  {
    doc: "NF-e 16338",
    date: "2026-05-22",
    amount: 187.88,
  },
  {
    doc: "NF-e 16339",
    date: "2026-05-26",
    amount: 233.17,
  },
  {
    doc: "NF-e 16340",
    date: "2026-05-30",
    amount: 357.0,
  },
  {
    doc: "NF-e 16341",
    date: "2026-05-31",
    amount: 2254.53,
  },
  {
    doc: "NF-e 16342",
    date: "2026-06-03",
    amount: 357.0,
  },
  {
    doc: "NF-e 16343",
    date: "2026-06-03",
    amount: 233.17,
  },
  {
    doc: "NF-e 16344",
    date: "2026-06-04",
    amount: 233.17,
  },
  {
    doc: "NF-e 16345",
    date: "2026-06-14",
    amount: 187.88,
  },
  {
    doc: "NF-e 16346",
    date: "2026-06-15",
    amount: 187.88,
  },
  {
    doc: "NF-e 16347",
    date: "2026-06-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16348",
    date: "2026-06-16",
    amount: 262.92,
  },
  {
    doc: "NF-e 16349",
    date: "2026-06-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16350",
    date: "2026-06-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16351",
    date: "2026-06-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16352",
    date: "2026-06-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16353",
    date: "2026-06-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16354",
    date: "2026-06-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16355",
    date: "2026-06-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16356",
    date: "2026-06-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16357",
    date: "2026-06-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16358",
    date: "2026-06-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16359",
    date: "2026-06-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16360",
    date: "2026-06-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16361",
    date: "2026-06-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16362",
    date: "2026-06-16",
    amount: 187.88,
  },
  {
    doc: "NF-e 16363",
    date: "2026-06-17",
    amount: 254.37,
  },
  {
    doc: "NF-e 16364",
    date: "2026-06-17",
    amount: 187.88,
  },
  {
    doc: "NF-e 16365",
    date: "2026-06-17",
    amount: 187.88,
  },
  {
    doc: "NF-e 16366",
    date: "2026-06-17",
    amount: 233.17,
  },
  {
    doc: "NF-e 16367",
    date: "2026-06-18",
    amount: 187.88,
  },
  {
    doc: "NF-e 16368",
    date: "2026-06-18",
    amount: 233.17,
  },
];

export const JCE_2T2026_DEVOLUCOES: DocFixture[] = [
  {
    doc: "NF-e 16369",
    date: "2026-06-18",
    amount: -2254.53,
  },
];

export const JCE_2T2026_SERVICOS: DocFixture[] = [
  {
    doc: "NFS-e 36",
    date: "2026-04-15",
    amount: 11173.9,
  },
  {
    doc: "NFS-e 37",
    date: "2026-05-20",
    amount: 10568.38,
  },
  {
    doc: "NFS-e 38",
    date: "2026-06-18",
    amount: 11430.96,
  },
];

export const JCE_2T2026_EXTERIOR: DocFixture[] = [
  {
    doc: "Rend. e Ganhos de Capital no Exterior",
    date: "2026-06-30",
    amount: 2033.7,
  },
];
